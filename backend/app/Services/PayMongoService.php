<?php

namespace App\Services;

use App\Models\Booking;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class PayMongoService
{
    public function createCheckoutSession(Booking $booking, float $amount): array
    {
        $secretKey = config('services.paymongo.secret_key');
        abort_unless(is_string($secretKey) && $secretKey !== '', 503, 'Online payments are not configured.');

        $frontendUrl = rtrim((string) config('services.paymongo.frontend_url', config('app.url')), '/');
        $lineItems = $this->checkoutLineItems($booking, $amount);
        $response = Http::withBasicAuth($secretKey, '')
            ->acceptJson()
            ->post('https://api.paymongo.com/v2/checkout_sessions', [
                'data' => [
                    'attributes' => [
                        'line_items' => $lineItems,
                        'payment_method_types' => ['card', 'gcash', 'paymaya', 'qrph'],
                        'success_url' => $frontendUrl.'/account?payment=success&booking='.$booking->id,
                        'cancel_url' => $frontendUrl.'/account?payment=cancelled&booking='.$booking->id,
                        'reference_number' => $booking->reference,
                    ],
                ],
            ]);

        $response->throw();
        $data = $response->json('data');
        $checkoutUrl = is_array($data) ? data_get($data, 'attributes.checkout_url') : null;
        $sessionId = is_array($data) ? ($data['id'] ?? null) : null;
        abort_unless(is_string($checkoutUrl) && $checkoutUrl !== '' && is_string($sessionId), 502, 'PayMongo did not return a checkout session.');

        return ['id' => $sessionId, 'url' => $checkoutUrl];
    }

    private function checkoutLineItems(Booking $booking, float $amount): array
    {
        $fullAmount = (float) $booking->total_amount;
        if (abs($amount - $fullAmount) > 0.01) {
            return [[
                'name' => 'Reservation fee or downpayment for booking '.$booking->reference,
                'amount' => (int) round($amount * 100),
                'currency' => 'PHP',
                'quantity' => 1,
            ]];
        }

        $items = collect([
            ['Daily rental', (float) $booking->rental_amount],
            ['Additional charges', (float) $booking->additional_charges],
            ['Fuel charge', (float) $booking->fuel_charge],
            ['RFID charge', (float) $booking->rfid_charge],
            ['Damage fees', (float) $booking->damage_fees],
            ['Car wash fees', (float) $booking->car_wash_fees],
            ['Extension fees', (float) $booking->extension_fees],
            ['Delivery fee', (float) $booking->delivery_fee],
            ['Return pickup fee', (float) $booking->return_pickup_fee],
            ['Security deposit', (float) $booking->deposit],
        ])->filter(fn (array $item): bool => $item[1] > 0);

        $items = $items->map(fn (array $item): array => [
            'name' => $item[0],
            'amount' => (int) round($item[1] * 100),
            'currency' => 'PHP',
            'quantity' => 1,
        ])->values()->all();

        abort_unless($items !== [], 422, 'PayMongo checkout has no payable line items.');
        $lineItemTotal = array_sum(array_column($items, 'amount'));
        $difference = (int) round($fullAmount * 100) - $lineItemTotal;
        if ($difference > 0) {
            $items[] = [
                'name' => 'Other booking charges',
                'amount' => $difference,
                'currency' => 'PHP',
                'quantity' => 1,
            ];
        } elseif ($difference < 0) {
            $lastIndex = count($items) - 1;
            $items[$lastIndex]['amount'] += $difference;
            abort_if($items[$lastIndex]['amount'] <= 0, 422, 'PayMongo checkout line items are invalid.');
        }

        return $items;
    }

    public function verifyWebhook(string $payload, ?string $signature): void
    {
        $secret = config('services.paymongo.webhook_secret');
        abort_unless(is_string($secret) && $secret !== '', 503, 'PayMongo webhooks are not configured.');
        abort_unless(is_string($signature) && $signature !== '', 403, 'Invalid PayMongo webhook signature.');

        $parts = collect(explode(',', $signature))->mapWithKeys(function (string $part): array {
            [$key, $value] = array_pad(explode('=', $part, 2), 2, '');
            return [trim($key) => trim($value)];
        });
        $timestamp = $parts->get('t');
        $provided = $parts->get('li') ?: $parts->get('te');
        abort_unless(is_string($timestamp) && is_string($provided), 403, 'Invalid PayMongo webhook signature.');
        $expected = hash_hmac('sha256', $timestamp.'.'.$payload, $secret);
        abort_unless(hash_equals($expected, $provided), 403, 'Invalid PayMongo webhook signature.');
    }
}
