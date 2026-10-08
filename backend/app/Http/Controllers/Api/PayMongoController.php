<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
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
        $payMongo->verifyWebhook($payload, $request->header('Paymongo-Signature'));
        $event = $request->json()->all();
        $type = data_get($event, 'data.attributes.type');
        if ($type !== 'checkout_session.payment.paid') {
            return response()->json(['received' => true]);
        }

        $session = data_get($event, 'data.attributes.data');
        $sessionId = data_get($session, 'id');
        $reference = data_get($session, 'attributes.reference_number');
        abort_unless(is_string($sessionId) || is_string($reference), 422, 'PayMongo webhook has no checkout reference.');

        DB::transaction(function () use ($sessionId, $reference): void {
            $booking = Booking::query()
                ->where('paymongo_checkout_session_id', $sessionId)
                ->orWhere('reference', $reference)
                ->lockForUpdate()
                ->firstOrFail();
            if ($booking->payments()->where('provider', 'paymongo')->where('provider_reference', $sessionId)->exists()) {
                return;
            }

            $amount = (float) data_get(request()->json()->all(), 'data.attributes.data.attributes.amount_paid', 0) / 100;
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
