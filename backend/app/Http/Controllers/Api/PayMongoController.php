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
        if ($type !== 'checkout_session.payment.paid') {
            return response()->json(['received' => true]);
        }

        $session = data_get($event, 'data.attributes.data');
        $sessionId = data_get($session, 'id');
        $reference = data_get($session, 'attributes.reference_number');
        $payments = data_get($session, 'attributes.payments', []);
        $amountInMinorUnits = collect(is_array($payments) ? $payments : [])
            ->sum(fn (mixed $payment): int => (int) (data_get($payment, 'attributes.amount_paid') ?: data_get($payment, 'attributes.amount', 0)));
        if ($amountInMinorUnits === 0) {
            $amountInMinorUnits = (int) (data_get($session, 'attributes.amount_paid') ?: data_get($session, 'attributes.amount', 0));
        }
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
                abort_if($amount <= 0 || $amount > (float) $booking->total_amount, 422, 'Invalid PayMongo payment amount.');
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
            $booking->update([
                'status' => Booking::UPCOMING,
                'payment_status' => $amount >= (float) $booking->total_amount ? 'paid' : 'partial',
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
}
