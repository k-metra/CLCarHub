<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Vehicle;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Carbon;

class BookingController extends Controller
{
    public function index(Request $request)
    {
        $now = now();
        $query = Booking::with(['customer', 'vehicle.images', 'payments', 'statusHistory.user'])
            ->when($request->search, function ($query, $search) {
                $query->where(function ($query) use ($search) {
                    $query->where('reference', 'like', "%{$search}%")
                        ->orWhereHas('customer', fn ($customer) => $customer->where('name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%")->orWhere('phone', 'like', "%{$search}%"))
                        ->orWhereHas('vehicle', fn ($vehicle) => $vehicle->where('name', 'like', "%{$search}%")->orWhere('brand', 'like', "%{$search}%")->orWhere('model', 'like', "%{$search}%")->orWhere('plate_number', 'like', "%{$search}%"));
                });
            })
            ->when($request->filter, function ($query, $filter) use ($now) {
                match ($filter) {
                    'upcoming' => $query->where('pickup_at', '>', $now)->whereNotIn('status', ['cancelled', 'rejected', 'completed']),
                    'ongoing' => $query->where('pickup_at', '<=', $now)->where('return_at', '>=', $now)->whereNotIn('status', ['cancelled', 'rejected', 'completed']),
                    'confirmed' => $query->where('status', 'confirmed'),
                    'pending' => $query->where('status', 'pending'),
                    'rejected' => $query->where('status', 'rejected'),
                    'cancelled' => $query->where('status', 'cancelled'),
                    default => null,
                };
            });

        return $query->orderBy('pickup_at', $request->input('sort') === 'oldest' ? 'asc' : 'desc')->paginate(min(100, max(1, (int) $request->input('per_page', 15))));
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->rules());
        $payments = $data['payments'] ?? [];
        unset($data['payments']);

        return DB::transaction(function () use ($data, $payments, $request) {
            $vehicle = Vehicle::lockForUpdate()->findOrFail($data['vehicle_id']);
            abort_if($vehicle->status !== 'available' || $vehicle->bookings()->whereIn('status', ['pending', 'confirmed', 'awaiting_payment', 'paid', 'active'])->where('pickup_at', '<', $data['return_at'])->where('return_at', '>', $data['pickup_at'])->exists(), 422, 'The vehicle is not available for the selected period.');
            $days = $this->rentalDays($data['pickup_at'], $data['return_at']);
            $rental = $days * (float) $vehicle->daily_rate;
            $reservationFee = (float) ($vehicle->reservation_fee ?? 0);
            $securityDeposit = (float) ($vehicle->security_deposit_fee ?? $vehicle->deposit ?? 0);
            $deposit = (float) ($data['deposit'] ?? $securityDeposit);
            $fees = collect(['fuel_charge', 'rfid_charge', 'damage_fees', 'car_wash_fees', 'extension_fees'])->sum(fn ($fee) => (float) ($data[$fee] ?? 0));
            $total = $rental + (float) ($data['additional_charges'] ?? 0) + $fees + $reservationFee + $securityDeposit - (float) ($data['discount'] ?? 0);
            $booking = Booking::create([...$data, 'reference' => 'CLCH-'.now()->format('Y').'-'.str_pad((string) (Booking::max('id') + 1), 6, '0', STR_PAD_LEFT), 'rental_amount' => $rental, 'total_amount' => max(0, $total), 'deposit' => $deposit, 'created_by' => $request->user()?->id]);
            $this->syncPayments($booking, $payments);

            return response()->json($booking->load(['customer', 'vehicle.images', 'payments', 'statusHistory.user']), 201);
        });
    }

    public function show(Booking $booking)
    {
        return $booking->load(['customer', 'vehicle.images', 'creator', 'payments', 'statusHistory.user']);
    }

    public function update(Request $request, Booking $booking)
    {
        $data = $request->validate($this->rules(true));
        $oldStatus = $booking->status;
        $reason = $data['status_reason'] ?? null;
        if (array_key_exists('status', $data) && $data['status'] !== $oldStatus) {
            abort_unless(in_array($data['status'], $this->allowedStatusTransitions()[$booking->status] ?? [], true), 422, "A {$booking->status} booking cannot be changed to {$data['status']}.");
            if (in_array($data['status'], ['cancelled', 'rejected'], true)) {
                abort_if(blank($reason), 422, 'A reason is required when cancelling or rejecting a booking.');
            }
        }
        unset($data['status_reason']);
        $payments = $data['payments'] ?? null;
        unset($data['payments']);
        $booking->update($data);
        if (array_key_exists('status', $data) && $data['status'] !== $oldStatus) {
            $booking->statusHistory()->create(['from_status' => $oldStatus, 'to_status' => $booking->status, 'reason' => $reason, 'changed_by' => $request->user()?->id]);
        }
        $booking->refresh();
        $vehicle = Vehicle::findOrFail($booking->vehicle_id);
        $booking->rental_amount = $this->rentalDays($booking->pickup_at, $booking->return_at) * (float) $vehicle->daily_rate;
        $booking->deposit = (float) ($vehicle->security_deposit_fee ?? $vehicle->deposit ?? 0);
        $booking->save();
        $this->recalculateTotal($booking);
        if ($payments !== null) $this->syncPayments($booking, $payments);

        return $booking->fresh(['customer', 'vehicle.images', 'payments', 'statusHistory.user']);
    }

    public function destroy(Booking $booking)
    {
        $booking->update(['status' => 'cancelled']);

        return response()->noContent();
    }

    private function rules(bool $updating = false): array
    {
        $pickupRule = $updating ? ['sometimes', 'date'] : ['required', 'date', 'after_or_equal:now'];
        $returnRule = $updating ? ['sometimes', 'date', 'after:pickup_at'] : ['required', 'date', 'after:pickup_at'];
        return ['customer_id' => [$updating ? 'sometimes' : 'required', 'exists:customers,id'], 'vehicle_id' => [$updating ? 'sometimes' : 'required', 'exists:vehicles,id'], 'pickup_at' => $pickupRule, 'return_at' => $returnRule, 'destination' => ['nullable', 'string', 'max:255'], 'delivery_address' => ['nullable', 'string', 'max:255'], 'return_address' => ['nullable', 'string', 'max:255'], 'notes' => ['nullable', 'string'], 'additional_charges' => ['nullable', 'numeric', 'min:0'], 'discount' => ['nullable', 'numeric', 'min:0'], 'deposit' => ['nullable', 'numeric', 'min:0'], 'fuel_charge' => ['nullable', 'numeric', 'min:0'], 'rfid_charge' => ['nullable', 'numeric', 'min:0'], 'damage_fees' => ['nullable', 'numeric', 'min:0'], 'car_wash_fees' => ['nullable', 'numeric', 'min:0'], 'extension_fees' => ['nullable', 'numeric', 'min:0'], 'status' => ['sometimes', 'in:pending,confirmed,awaiting_payment,paid,active,completed,cancelled,rejected'], 'status_reason' => ['nullable', 'string', 'max:1000'], 'payment_status' => ['sometimes', 'in:unpaid,partial,paid,refunded'], 'payments' => ['nullable', 'array'], 'payments.*.amount' => ['required', 'numeric', 'min:0'], 'payments.*.notes' => ['nullable', 'string'], 'payments.*.paid_at' => ['required', 'date']];
    }

    private function allowedStatusTransitions(): array
    {
        return [
            'pending' => ['confirmed', 'cancelled', 'rejected'],
            'confirmed' => ['awaiting_payment', 'paid', 'active', 'cancelled', 'rejected'],
            'awaiting_payment' => ['paid', 'cancelled', 'rejected'],
            'paid' => ['active', 'cancelled'],
            'active' => ['completed', 'cancelled'],
            'completed' => [],
            'cancelled' => [],
            'rejected' => [],
        ];
    }

    private function syncPayments(Booking $booking, array $payments): void
    {
        $booking->payments()->delete();
        foreach ($payments as $payment) {
            $booking->payments()->create(['amount' => $payment['amount'], 'notes' => $payment['notes'] ?? null, 'paid_at' => $payment['paid_at'], 'payment_method' => null, 'status' => 'paid']);
        }
    }

    private function recalculateTotal(Booking $booking): void
    {
        $vehicle = $booking->vehicle()->firstOrFail();
        $fees = collect(['fuel_charge', 'rfid_charge', 'damage_fees', 'car_wash_fees', 'extension_fees'])->sum(fn ($fee) => (float) $booking->{$fee});
        $reservationFee = (float) ($vehicle->reservation_fee ?? 0);
        $securityDeposit = (float) ($vehicle->security_deposit_fee ?? $booking->deposit ?? $vehicle->deposit ?? 0);
        $booking->update(['total_amount' => max(0, (float) $booking->rental_amount + (float) $booking->additional_charges + $fees + $reservationFee + $securityDeposit - (float) $booking->discount)]);
    }

    private function rentalDays(Carbon|string $pickupAt, Carbon|string $returnAt): int
    {
        $pickupAt = $pickupAt instanceof Carbon ? $pickupAt : Carbon::parse($pickupAt);
        $returnAt = $returnAt instanceof Carbon ? $returnAt : Carbon::parse($returnAt);

        return max(1, (int) ceil($pickupAt->diffInMinutes($returnAt) / (24 * 60)));
    }
}
