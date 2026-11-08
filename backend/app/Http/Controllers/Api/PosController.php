<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Fund;
use App\Models\FundTransaction;
use App\Services\PayMongoService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PosController extends Controller
{
    public function index(Request $request)
    {
        $date = $request->date('date')?->toDateString() ?? now()->toDateString();
        $payments = \App\Models\Payment::query()
            ->whereDate('paid_at', $date)
            ->where('status', 'paid')
            ->with(['booking.customer', 'booking.vehicle', 'fund', 'creator'])
            ->latest('paid_at')
            ->get();

        return response()->json([
            'date' => $date,
            'summary' => [
                'cash' => (float) $payments->reject(fn ($payment) => $payment->provider === 'paymongo')->sum('amount'),
                'online' => (float) $payments->filter(fn ($payment) => $payment->provider === 'paymongo')->sum('amount'),
                'total' => (float) $payments->sum('amount'),
            ],
            'payments' => $payments,
            'funds' => Fund::query()->orderBy('name')->get(),
        ]);
    }

    public function storePayment(Request $request, Booking $booking)
    {
        $data = $request->validate([
            'amount' => ['required', 'numeric', 'min:0.01'],
            'fund_id' => ['required', 'exists:funds,id'],
            'paid_at' => ['required', 'date'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $payment = DB::transaction(function () use ($data, $booking, $request) {
            $lockedBooking = Booking::query()->with('payments')->lockForUpdate()->findOrFail($booking->id);
            abort_if(in_array($lockedBooking->status, [Booking::CANCELLED, Booking::REJECTED], true), 422, 'Cancelled or rejected bookings cannot receive payments.');
            $balance = (float) $lockedBooking->balance;
            abort_if((float) $data['amount'] > $balance + 0.01, 422, 'Payment cannot exceed the booking balance.');

            $payment = $lockedBooking->payments()->create([
                'amount' => $data['amount'],
                'created_by' => $request->user()?->id,
                'fund_id' => $data['fund_id'],
                'notes' => $data['notes'] ?? null,
                'paid_at' => $data['paid_at'],
                'payment_method' => 'cash',
                'status' => 'paid',
            ]);
            FundTransaction::create([
                'fund_id' => $data['fund_id'],
                'payment_id' => $payment->id,
                'type' => 'inflow',
                'transacted_at' => $payment->paid_at,
                'amount' => $payment->amount,
                'description' => "Cash payment for {$lockedBooking->reference}",
                'notes' => $payment->notes,
                'created_by' => $request->user()?->id,
            ]);
            $remaining = max(0, $balance - (float) $data['amount']);
            $lockedBooking->update(['payment_status' => $remaining <= 0.01 ? 'paid' : 'partial']);

            return $payment;
        });

        return response()->json($payment->load(['booking.customer', 'booking.vehicle', 'fund', 'creator']), 201);
    }

    public function checkout(Request $request, Booking $booking, PayMongoService $payMongo)
    {
        $data = $request->validate(['amount' => ['required', 'numeric', 'min:0.01']]);
        $booking->load('payments');
        abort_if(in_array($booking->status, [Booking::CANCELLED, Booking::REJECTED], true), 422, 'Cancelled or rejected bookings cannot receive payments.');
        $amount = round((float) $data['amount'], 2);
        abort_if($amount > (float) $booking->balance + 0.01, 422, 'Payment cannot exceed the booking balance.');

        $session = $payMongo->createCheckoutSession($booking, $amount, '/admin/pos');
        $booking->update([
            'paymongo_checkout_session_id' => $session['id'],
            'paymongo_checkout_created_by' => $request->user()?->id,
        ]);

        return response()->json(['checkout_url' => $session['url']]);
    }

    public function sync(Request $request, Booking $booking, PayMongoService $payMongo)
    {
        $sessionId = $booking->paymongo_checkout_session_id;
        abort_unless(is_string($sessionId) && $sessionId !== '', 422, 'This booking has no pending PayMongo checkout.');

        $existingPayment = $booking->payments()
            ->where('provider', 'paymongo')
            ->where('provider_reference', $sessionId)
            ->first();
        if ($existingPayment) {
            return response()->json(['status' => 'paid', 'recorded' => true, 'payment' => $existingPayment->load('creator')]);
        }

        $session = $payMongo->retrieveCheckoutSession($sessionId);
        $attributes = $session['attributes'] ?? [];
        $payments = data_get($attributes, 'payments.data', $attributes['payments'] ?? []);
        $payments = is_array($payments) ? $payments : [];
        $paidPayment = collect($payments)->first(function (mixed $payment): bool {
            return data_get($payment, 'attributes.status') === 'paid'
                || data_get($payment, 'status') === 'paid';
        });
        if (! $paidPayment) {
            return response()->json(['status' => $attributes['status'] ?? 'pending', 'recorded' => false]);
        }

        $amountInMinorUnits = (int) (data_get($paidPayment, 'attributes.amount_paid')
            ?: data_get($paidPayment, 'attributes.amount')
            ?: data_get($paidPayment, 'amount_paid')
            ?: data_get($paidPayment, 'amount', 0));
        abort_if($amountInMinorUnits <= 0, 422, 'PayMongo returned an invalid paid amount.');

        $payment = DB::transaction(function () use ($booking, $sessionId, $amountInMinorUnits, $request): \App\Models\Payment {
            $lockedBooking = Booking::query()->with('payments')->lockForUpdate()->findOrFail($booking->id);
            $payment = $lockedBooking->payments()
                ->where('provider', 'paymongo')
                ->where('provider_reference', $sessionId)
                ->first();
            if ($payment) {
                return $payment->load('creator');
            }

            $amount = $amountInMinorUnits / 100;
            $remaining = max(0, (float) $lockedBooking->balance);
            abort_if($amount <= 0 || $amount > $remaining + 0.01, 422, 'Invalid PayMongo payment amount.');
            $payment = $lockedBooking->payments()->create([
                'amount' => min($amount, $remaining),
                'created_by' => $lockedBooking->paymongo_checkout_created_by,
                'payment_method' => 'paymongo',
                'status' => 'paid',
                'paid_at' => now(),
                'reference' => $sessionId,
                'provider' => 'paymongo',
                'provider_reference' => $sessionId,
                'notes' => 'PayMongo checkout payment',
            ]);
            $fund = Fund::firstOrCreate(
                ['name' => 'PayMongo'],
                ['type' => 'e-wallet', 'opening_balance' => 0, 'notes' => 'Dedicated fund for PayMongo payments.'],
            );
            FundTransaction::firstOrCreate(
                ['payment_id' => $payment->id],
                [
                    'fund_id' => $fund->id,
                    'type' => 'inflow',
                    'transacted_at' => $payment->paid_at,
                    'amount' => $payment->amount,
                    'description' => "PayMongo payment for {$lockedBooking->reference}",
                    'notes' => "PayMongo reference: {$sessionId}",
                    'created_by' => $request->user()?->id,
                ],
            );
            $totalPaid = (float) $lockedBooking->payments()->sum('amount');
            $lockedBooking->update([
                'status' => Booking::UPCOMING,
                'payment_status' => max(0, (float) $lockedBooking->total_amount - $totalPaid) <= 0.01 ? 'paid' : 'partial',
            ]);

            return $payment->load('creator');
        });

        return response()->json(['status' => 'paid', 'recorded' => true, 'payment' => $payment]);
    }
}
