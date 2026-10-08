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
        $response = Http::withBasicAuth($secretKey, '')
            ->acceptJson()
            ->post('https://api.paymongo.com/v2/checkout_sessions', [
                'data' => [
                    'attributes' => [
                        'line_items' => [[
                            'name' => 'CL CarHub reservation '.$booking->reference,
                            'amount' => (int) round($amount * 100),
                            'currency' => 'PHP',
                            'quantity' => 1,
                        ]],
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
