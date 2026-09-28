<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Vehicle;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class BookingController extends Controller
{
    public function index(Request $request)
    {
        return Booking::with(['customer', 'vehicle'])->when($request->status, fn ($q, $v) => $q->where('status', $v))->latest()->paginate(15);
    }

    public function store(Request $request)
    {
        $data = $request->validate(['customer_id' => ['required', 'exists:customers,id'], 'vehicle_id' => ['required', 'exists:vehicles,id'], 'pickup_at' => ['required', 'date', 'after_or_equal:now'], 'return_at' => ['required', 'date', 'after:pickup_at'], 'additional_charges' => ['nullable', 'numeric', 'min:0'], 'discount' => ['nullable', 'numeric', 'min:0'], 'deposit' => ['nullable', 'numeric', 'min:0'], 'notes' => ['nullable', 'string']]);

        return DB::transaction(function () use ($data, $request) {
            $vehicle = Vehicle::lockForUpdate()->findOrFail($data['vehicle_id']);
            abort_if($vehicle->status !== 'available' || $vehicle->bookings()->whereIn('status', ['pending', 'confirmed', 'awaiting_payment', 'paid', 'active'])->where('pickup_at', '<', $data['return_at'])->where('return_at', '>', $data['pickup_at'])->exists(), 422, 'The vehicle is not available for the selected period.');
            $days = max(1, now()->parse($data['pickup_at'])->diffInDays(now()->parse($data['return_at'])));
            $rental = $days * (float) $vehicle->daily_rate;
            $deposit = (float) ($data['deposit'] ?? $vehicle->deposit);
            $total = $rental + (float) ($data['additional_charges'] ?? 0) + $deposit - (float) ($data['discount'] ?? 0);
            $booking = Booking::create([...$data, 'reference' => 'CLCH-'.now()->format('Y').'-'.str_pad((string) (Booking::max('id') + 1), 6, '0', STR_PAD_LEFT), 'rental_amount' => $rental, 'total_amount' => max(0, $total), 'deposit' => $deposit, 'created_by' => $request->user()?->id]);

            return response()->json($booking->load(['customer', 'vehicle']), 201);
        });
    }

    public function show(Booking $booking)
    {
        return $booking->load(['customer', 'vehicle', 'creator']);
    }

    public function update(Request $request, Booking $booking)
    {
        $booking->update($request->validate(['status' => ['sometimes', 'in:pending,confirmed,awaiting_payment,paid,active,completed,cancelled,rejected'], 'payment_status' => ['sometimes', 'in:unpaid,partial,paid,refunded'], 'notes' => ['nullable', 'string']]));

        return $booking->fresh(['customer', 'vehicle']);
    }

    public function destroy(Booking $booking)
    {
        $booking->update(['status' => 'cancelled']);

        return response()->noContent();
    }
}
