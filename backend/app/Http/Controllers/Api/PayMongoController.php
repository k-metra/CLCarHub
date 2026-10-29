<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Fund;
use App\Models\FundTransaction;
use App\Services\PayMongoService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use App\Notifications\BookingPaymentNotification;

class PayMongoController extends Controller
{
    public function webhook(Request $request, PayMongoService $payMongo)
    {
        $payload = $request->getContent();
        Log::info('PayMongo webhook received', [
            'payload_bytes' => strlen($payload),
            'has_signature' => $request->headers->has('Paymongo-Signature'),
        ]);
        $payMongo->verifyWebhook($payload, $request->header('Paymongo-Signature'));
        $event = $request->json()->all();
        $type = data_get($event, 'data.attributes.type');
        Log::info('PayMongo webhook verified', [
            'event_type' => $type,
            'event_id' => data_get($event, 'data.id'),
        ]);
        if (! in_array($type, ['checkout_session.payment.paid', 'payment.paid'], true)) {
            return response()->json(['received' => true]);
        }

        $resource = data_get($event, 'data.attributes.data', []);
        $session = $type === 'payment.paid'
            ? data_get($event, 'data.attributes.data.attributes.checkout_session', $resource)
            : $resource;
        $sessionId = data_get($session, 'id')
            ?: data_get($event, 'data.attributes.data.attributes.checkout_session_id');
        $reference = data_get($session, 'attributes.reference_number')
            ?: data_get($resource, 'attributes.reference_number');
        $amountInMinorUnits = $this->payableAmountInMinorUnits($session, $resource);
        abort_unless(is_string($sessionId) || is_string($reference), 422, 'PayMongo webhook has no checkout reference.');

        DB::transaction(function () use ($sessionId, $reference, $amountInMinorUnits): void {
            $booking = Booking::query()
                ->where('paymongo_checkout_session_id', $sessionId)
                ->orWhere('reference', $reference)
                ->lockForUpdate()
                ->firstOrFail();
            $payment = $booking->payments()
                ->where('provider', 'paymongo')
                ->where('provider_reference', $sessionId)
                ->first();

            $amount = $amountInMinorUnits / 100;
            if (! $payment) {
                $paidAmount = (float) $booking->payments()->sum('amount');
                $remaining = max(0, (float) $booking->total_amount - $paidAmount);
                abort_if($amount <= 0 || $amount > $remaining + 0.01, 422, 'Invalid PayMongo payment amount.');
                $amount = min($amount, $remaining);
                $payment = $booking->payments()->create([
                    'amount' => $amount,
                    'payment_method' => 'paymongo',
                    'status' => 'paid',
                    'paid_at' => now(),
                    'reference' => $sessionId,
                    'provider' => 'paymongo',
                    'provider_reference' => $sessionId,
                    'notes' => 'PayMongo checkout payment',
                ]);
            }
            $payMongoFund = Fund::firstOrCreate(
                ['name' => 'PayMongo'],
                ['type' => 'e-wallet', 'opening_balance' => 0, 'notes' => 'Dedicated fund for PayMongo payments.'],
            );
            $fundTransaction = FundTransaction::firstOrCreate(
                ['payment_id' => $payment->id],
                [
                    'fund_id' => $payMongoFund->id,
                    'type' => 'inflow',
                    'transacted_at' => $payment->paid_at,
                    'amount' => $payment->amount,
                    'description' => "PayMongo payment for {$booking->reference}",
                    'notes' => "PayMongo reference: {$sessionId}",
                ],
            );
            $payment->update(['fund_id' => $fundTransaction->fund_id]);
            $totalPaid = (float) $booking->payments()->sum('amount');
            $booking->update([
                'status' => Booking::UPCOMING,
                'payment_status' => $totalPaid >= (float) $booking->total_amount ? 'paid' : 'partial',
            ]);
            $booking->load('customer.user');
            $email = $booking->customer?->email ?: $booking->customer?->user?->email;
            if ($email) {
                Notification::route('mail', $email)->notify(new BookingPaymentNotification($booking));
            }
            Log::info('PayMongo payment recorded', ['booking_id' => $booking->id, 'payment_id' => $payment->id]);
        });

        return response()->json(['received' => true]);
    }

    private function payableAmountInMinorUnits(array $session, array $resource): int
    {
        $lineItems = data_get($session, 'attributes.line_items', []);
        $lineItemTotal = collect(is_array($lineItems) ? $lineItems : [])
            ->sum(fn (mixed $item): int => (int) data_get($item, 'amount', data_get($item, 'attributes.amount', 0))
                * max(1, (int) data_get($item, 'quantity', data_get($item, 'attributes.quantity', 1))));
        if ($lineItemTotal > 0) {
            return $lineItemTotal;
        }

        $payments = data_get($session, 'attributes.payments', []);
        $paymentTotal = collect(is_array($payments) ? $payments : [])
            ->sum(fn (mixed $payment): int => $this->paymentAmountWithoutProviderFee($payment));
        if ($paymentTotal > 0) {
            return $paymentTotal;
        }

        return $this->paymentAmountWithoutProviderFee([
            'attributes' => [
                'amount_paid' => data_get($resource, 'attributes.amount_paid')
                    ?: data_get($session, 'attributes.amount_paid'),
                'amount' => data_get($resource, 'attributes.amount')
                    ?: data_get($session, 'attributes.amount'),
                'net_amount' => data_get($resource, 'attributes.net_amount')
                    ?: data_get($session, 'attributes.net_amount'),
                'fee' => data_get($resource, 'attributes.fee')
                    ?: data_get($session, 'attributes.fee'),
            ],
        ]);
    }

    private function paymentAmountWithoutProviderFee(mixed $payment): int
    {
        $attributes = is_array($payment) ? ($payment['attributes'] ?? $payment) : [];
        $netAmount = (int) data_get($attributes, 'net_amount', 0);
        if ($netAmount > 0) {
            return $netAmount;
        }

        $amount = (int) (data_get($attributes, 'amount_paid') ?: data_get($attributes, 'amount', 0));
        $fee = (int) data_get($attributes, 'fee', 0);

        return max(0, $amount - $fee);
    }
}
