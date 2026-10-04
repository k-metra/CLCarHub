<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Vehicle;
use App\Models\FundTransaction;
use App\Models\FleetSetting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use App\Services\PushNotificationService;

class BookingController extends Controller
{
    public function customerIndex(Request $request)
    {
        $customer = $this->authenticatedCustomer($request);

        return Booking::with(['vehicle.images'])
            ->where('customer_id', $customer->id)
            ->latest('pickup_at')
            ->paginate(min(100, max(1, (int) $request->input('per_page', 15))));
    }

    public function customerShow(Request $request, Booking $booking)
    {
        $customer = $this->authenticatedCustomer($request);
        abort_unless($booking->customer_id === $customer->id, 404);

        return $booking->load(['vehicle.images', 'payments.fund', 'statusHistory.user']);
    }

    public function customerStore(Request $request)
    {
        $customer = $this->authenticatedCustomer($request);
        $data = $request->validate([
            'vehicle_id' => ['required', 'exists:vehicles,id'],
            'pickup_at' => ['required', 'date', 'after_or_equal:now'],
            'return_at' => ['required', 'date', 'after:pickup_at'],
            'destination' => ['nullable', 'string', 'max:255'],
            'delivery_address' => ['required_if:payment_method,cash_on_delivery', 'nullable', 'string', 'max:255'],
            'delivery_latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'delivery_longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'return_address' => ['nullable', 'string', 'max:255'],
            'return_latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'return_longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'notes' => ['nullable', 'string'],
            'payment_method' => ['required', 'in:cash_on_pickup,cash_on_delivery'],
        ]);

        return DB::transaction(function () use ($data, $customer, $request) {
            $vehicle = Vehicle::lockForUpdate()->findOrFail($data['vehicle_id']);
            abort_if(
                $vehicle->status !== 'available'
                    || $vehicle->bookings()->whereIn('status', ['pending', 'reserved', 'confirmed', 'awaiting_payment', 'paid', 'active'])
                        ->where('pickup_at', '<', $data['return_at'])
                        ->where('return_at', '>', $data['pickup_at'])
                        ->exists(),
                422,
                'The vehicle is not available for the selected period.'
            );

            $rentalBreakdown = $this->rentalBreakdown($data['pickup_at'], $data['return_at'], $vehicle);
            $rental = $rentalBreakdown['rental'];
            $fleetSettings = FleetSetting::findOrFail(1);
            $reservationFee = (float) $fleetSettings->reservation_fee;
            $securityDeposit = (float) ($vehicle->security_deposit_fee ?? $vehicle->deposit ?? 0);
            $delivery = $this->deliveryBreakdown($data, $vehicle, $fleetSettings);
            $booking = Booking::create([
                ...$data,
                'customer_id' => $customer->id,
                'reference' => 'CLCH-'.now()->format('Y').'-'.str_pad((string) (Booking::max('id') + 1), 6, '0', STR_PAD_LEFT),
                'status' => 'pending',
                'payment_status' => 'unpaid',
                'rental_amount' => $rental,
                'additional_charges' => 0,
                ...$delivery,
                'discount' => 0,
                'deposit' => $securityDeposit,
                'extension_fees' => $rentalBreakdown['extension'],
                'total_amount' => $this->totalBeforeDiscount($rental, $reservationFee, $securityDeposit, 0, 0, $rentalBreakdown['extension'], (float) $delivery['delivery_fee'] + (float) $delivery['return_pickup_fee'], $fleetSettings),
                'created_by' => $request->user()->id,
            ]);
            app(PushNotificationService::class)->sendToAdmins(
                'New booking',
                "{$customer->name} submitted {$booking->reference}.",
                "/admin/bookings?booking={$booking->id}",
                "booking-created-{$booking->id}",
            );

            return response()->json($booking->load(['vehicle.images']), 201);
        });
    }

    public function index(Request $request)
    {
        $now = now();
        $query = Booking::with(['customer', 'vehicle.images', 'payments.fund', 'statusHistory.user'])
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
                    'reserved' => $query->where('status', 'reserved'),
                    'pending' => $query->where('status', 'pending'),
                    'rejected' => $query->where('status', 'rejected'),
                    'cancelled' => $query->where('status', 'cancelled'),
                    default => null,
                };
            });

        $sort = $request->input('sort', 'priority');
        if (in_array($sort, ['latest', 'oldest'], true)) {
            return $query
                ->orderBy('pickup_at', $sort === 'oldest' ? 'asc' : 'desc')
                ->orderBy('id', 'desc')
                ->paginate(min(100, max(1, (int) $request->input('per_page', 15))));
        }

        return $query
            ->orderByRaw("CASE
                WHEN status = 'pending' THEN 0
                WHEN status IN ('reserved', 'confirmed', 'awaiting_payment', 'paid', 'active') THEN 1
                WHEN status = 'completed' THEN 2
                WHEN status = 'rejected' THEN 3
                WHEN status = 'cancelled' THEN 4
                ELSE 1
            END")
            ->orderBy('pickup_at', 'asc')
            ->orderBy('id', 'asc')
            ->paginate(min(100, max(1, (int) $request->input('per_page', 15))));
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->rules());
        $payments = $data['payments'] ?? [];
        unset($data['payments']);

        return DB::transaction(function () use ($data, $payments, $request) {
            $vehicle = Vehicle::lockForUpdate()->findOrFail($data['vehicle_id']);
            abort_if($vehicle->status !== 'available' || $vehicle->bookings()->whereIn('status', ['pending', 'reserved', 'confirmed', 'awaiting_payment', 'paid', 'active'])->where('pickup_at', '<', $data['return_at'])->where('return_at', '>', $data['pickup_at'])->exists(), 422, 'The vehicle is not available for the selected period.');
            $rentalBreakdown = $this->rentalBreakdown($data['pickup_at'], $data['return_at'], $vehicle);
            $rental = $rentalBreakdown['rental'];
            $fleetSettings = FleetSetting::findOrFail(1);
            $reservationFee = (float) $fleetSettings->reservation_fee;
            $securityDeposit = (float) ($vehicle->security_deposit_fee ?? $vehicle->deposit ?? 0);
            $deposit = (float) ($data['deposit'] ?? $securityDeposit);
            $fees = collect(['fuel_charge', 'rfid_charge', 'damage_fees', 'car_wash_fees'])->sum(fn ($fee) => (float) ($data[$fee] ?? 0));
            $extensionFees = array_key_exists('extension_fees', $data) ? (float) $data['extension_fees'] : $rentalBreakdown['extension'];
            $delivery = $this->deliveryBreakdown($data, $vehicle, $fleetSettings);
            $total = $this->totalBeforeDiscount($rental, $reservationFee, $securityDeposit, (float) ($data['additional_charges'] ?? 0), $fees, $extensionFees, (float) $delivery['delivery_fee'] + (float) $delivery['return_pickup_fee'], $fleetSettings) - (float) ($data['discount'] ?? 0);
            $booking = Booking::create([...$data, ...$delivery, 'extension_fees' => $extensionFees, 'reference' => 'CLCH-'.now()->format('Y').'-'.str_pad((string) (Booking::max('id') + 1), 6, '0', STR_PAD_LEFT), 'rental_amount' => $rental, 'total_amount' => max(0, $total), 'deposit' => $deposit, 'created_by' => $request->user()?->id]);
            $this->syncPayments($booking, $payments);
            $booking->load('customer');
            $customerName = $booking->customer?->name ?? 'A customer';
            app(PushNotificationService::class)->sendToAdmins(
                'New booking',
                "{$customerName} submitted {$booking->reference}.",
                "/admin/bookings?booking={$booking->id}",
                "booking-created-{$booking->id}",
            );

            return response()->json($booking->load(['customer', 'vehicle.images', 'payments.fund', 'statusHistory.user']), 201);
        });
    }

    public function show(Booking $booking)
    {
        return $booking->load([
            'customer.attachments',
            'customer.user:id,name,first_name,middle_name,last_name,date_of_birth,username,email',
            'vehicle.images',
            'creator',
            'payments.fund',
            'statusHistory.user',
        ]);
    }

    public function update(Request $request, Booking $booking)
    {
        $data = $request->validate($this->rules(true));
        $oldStatus = $booking->status;
        $reason = $data['status_reason'] ?? null;
        if (array_key_exists('status', $data) && $data['status'] !== $oldStatus) {
            abort_unless(in_array($data['status'], $this->allowedStatusTransitions()[$booking->status] ?? [], true), 422, "A {$booking->status} booking cannot be changed to {$data['status']}.");
            if ($data['status'] === 'reserved') {
                $reservationFee = (float) FleetSetting::findOrFail(1)->reservation_fee;
                $incomingPayments = $data['payments'] ?? null;
                $paidAmount = $incomingPayments === null
                    ? (float) $booking->payments()->where('status', 'paid')->sum('amount')
                    : collect($incomingPayments)->sum(fn (array $payment) => (float) $payment['amount']);
                abort_if($reservationFee > 0 && $paidAmount < $reservationFee, 422, 'The reservation fee must be paid before the booking can be reserved.');
            }
            if (in_array($data['status'], ['cancelled', 'rejected'], true)) {
                abort_if(blank($reason), 422, 'A reason is required when cancelling or rejecting a booking.');
            }
        }
        unset($data['status_reason']);
        $payments = $data['payments'] ?? null;
        unset($data['payments']);
        $vehicle = Vehicle::findOrFail($data['vehicle_id'] ?? $booking->vehicle_id);
        $fleetSettings = FleetSetting::findOrFail(1);
        if (array_key_exists('delivery_address', $data) || array_key_exists('delivery_latitude', $data) || array_key_exists('delivery_longitude', $data) || array_key_exists('return_address', $data) || array_key_exists('return_latitude', $data) || array_key_exists('return_longitude', $data) || array_key_exists('payment_method', $data) || array_key_exists('vehicle_id', $data)) {
            $data = [...$data, ...$this->deliveryBreakdown([...$booking->toArray(), ...$data], $vehicle, $fleetSettings)];
        }
        $booking->update($data);
        if (array_key_exists('status', $data) && $data['status'] !== $oldStatus) {
            $booking->statusHistory()->create(['from_status' => $oldStatus, 'to_status' => $booking->status, 'reason' => $reason, 'changed_by' => $request->user()?->id]);
        }
        $booking->refresh();
        $rentalBreakdown = $this->rentalBreakdown($booking->pickup_at, $booking->return_at, $vehicle);
        $booking->rental_amount = $rentalBreakdown['rental'];
        if (! array_key_exists('extension_fees', $data)) {
            $booking->extension_fees = $rentalBreakdown['extension'];
        }
        $booking->deposit = (float) ($vehicle->security_deposit_fee ?? $vehicle->deposit ?? 0);
        $booking->save();
        $this->recalculateTotal($booking);
        if ($payments !== null) $this->syncPayments($booking, $payments);
        if ($oldStatus !== $booking->status) {
            $booking->load('customer');
            app(PushNotificationService::class)->sendToAdmins(
                "Booking {$booking->status}",
                "{$booking->reference} was marked {$booking->status}.",
                "/admin/bookings?booking={$booking->id}",
                "booking-{$booking->status}-{$booking->id}",
            );
        }

        return $booking->fresh(['customer', 'vehicle.images', 'payments.fund', 'statusHistory.user']);
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
        return ['customer_id' => [$updating ? 'sometimes' : 'required', 'exists:customers,id'], 'vehicle_id' => [$updating ? 'sometimes' : 'required', 'exists:vehicles,id'], 'pickup_at' => $pickupRule, 'return_at' => $returnRule, 'destination' => ['nullable', 'string', 'max:255'], 'delivery_address' => ['nullable', 'string', 'max:255'], 'delivery_latitude' => ['nullable', 'numeric', 'between:-90,90'], 'delivery_longitude' => ['nullable', 'numeric', 'between:-180,180'], 'delivery_distance_km' => ['nullable', 'numeric', 'min:0'], 'delivery_rate_per_km' => ['nullable', 'numeric', 'min:0'], 'delivery_fee' => ['nullable', 'numeric', 'min:0'], 'return_address' => ['nullable', 'string', 'max:255'], 'return_latitude' => ['nullable', 'numeric', 'between:-90,90'], 'return_longitude' => ['nullable', 'numeric', 'between:-180,180'], 'return_distance_km' => ['nullable', 'numeric', 'min:0'], 'return_pickup_fee' => ['nullable', 'numeric', 'min:0'], 'payment_method' => ['nullable', 'in:cash_on_pickup,cash_on_delivery'], 'notes' => ['nullable', 'string'], 'additional_charges' => ['nullable', 'numeric', 'min:0'], 'discount' => ['nullable', 'numeric', 'min:0'], 'deposit' => ['nullable', 'numeric', 'min:0'], 'fuel_charge' => ['nullable', 'numeric', 'min:0'], 'rfid_charge' => ['nullable', 'numeric', 'min:0'], 'damage_fees' => ['nullable', 'numeric', 'min:0'], 'car_wash_fees' => ['nullable', 'numeric', 'min:0'], 'extension_fees' => ['nullable', 'numeric', 'min:0'], 'status' => ['sometimes', 'in:pending,reserved,confirmed,awaiting_payment,paid,active,completed,cancelled,rejected'], 'status_reason' => ['nullable', 'string', 'max:1000'], 'payment_status' => ['sometimes', 'in:unpaid,partial,paid,refunded'], 'payments' => ['nullable', 'array'], 'payments.*.amount' => ['required', 'numeric', 'min:0'], 'payments.*.fund_id' => ['nullable', 'exists:funds,id'], 'payments.*.notes' => ['nullable', 'string'], 'payments.*.paid_at' => ['required', 'date']];
    }

    private function authenticatedCustomer(Request $request)
    {
        $customer = $request->user()?->customer;
        abort_unless($customer, 403, 'Your account is not linked to a customer profile.');

        return $customer;
    }

    private function allowedStatusTransitions(): array
    {
        return [
            'pending' => ['reserved', 'confirmed', 'cancelled', 'rejected'],
            'reserved' => ['paid', 'active', 'cancelled', 'rejected'],
            'confirmed' => ['reserved', 'awaiting_payment', 'paid', 'active', 'cancelled', 'rejected'],
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
            $createdPayment = $booking->payments()->create(['amount' => $payment['amount'], 'fund_id' => $payment['fund_id'] ?? null, 'notes' => $payment['notes'] ?? null, 'paid_at' => $payment['paid_at'], 'payment_method' => null, 'status' => 'paid']);
            if ($createdPayment->fund_id) {
                FundTransaction::create([
                    'fund_id' => $createdPayment->fund_id,
                    'payment_id' => $createdPayment->id,
                    'type' => 'inflow',
                    'transacted_at' => $createdPayment->paid_at ?? now(),
                    'amount' => $createdPayment->amount,
                    'description' => "Booking payment {$booking->reference}",
                    'notes' => $createdPayment->notes,
                    'created_by' => $booking->created_by,
                ]);
            }
        }
    }

    private function recalculateTotal(Booking $booking): void
    {
        $vehicle = $booking->vehicle()->firstOrFail();
        $fleetSettings = FleetSetting::findOrFail(1);
        $fees = collect(['fuel_charge', 'rfid_charge', 'damage_fees', 'car_wash_fees'])->sum(fn ($fee) => (float) $booking->{$fee});
        $reservationFee = (float) $fleetSettings->reservation_fee;
        $securityDeposit = (float) ($vehicle->security_deposit_fee ?? $booking->deposit ?? $vehicle->deposit ?? 0);
        $booking->update(['total_amount' => max(0, $this->totalBeforeDiscount((float) $booking->rental_amount, $reservationFee, $securityDeposit, (float) $booking->additional_charges, $fees, (float) $booking->extension_fees, (float) $booking->delivery_fee + (float) $booking->return_pickup_fee, $fleetSettings) - (float) $booking->discount)]);
    }

    private function totalBeforeDiscount(float $rental, float $reservationFee, float $securityDeposit, float $additionalCharges, float $fees, float $extensionFees, float $deliveryFee, FleetSetting $settings): float
    {
        return $rental + $additionalCharges + $fees + $extensionFees + $deliveryFee + $securityDeposit + ($settings->reservation_fee_deductible ? 0 : $reservationFee);
    }

    private function deliveryBreakdown(array $data, Vehicle $vehicle, FleetSetting $settings): array
    {
        $originLat = $settings->garage_location_latitude;
        $originLon = $settings->garage_location_longitude;
        $hasDelivery = isset($data['delivery_latitude'], $data['delivery_longitude']);
        $hasReturnPickup = isset($data['return_latitude'], $data['return_longitude']);
        if (! $hasDelivery && ! $hasReturnPickup) {
            return ['delivery_distance_km' => null, 'delivery_rate_per_km' => null, 'delivery_fee' => 0, 'delivery_latitude' => null, 'delivery_longitude' => null, 'return_distance_km' => null, 'return_pickup_fee' => 0];
        }
        abort_if($originLat === null || $originLon === null, 422, 'Delivery fees are not available because the garage location has not been configured.');
        $vehicleRate = $vehicle->delivery_rate_per_km === null ? null : (float) $vehicle->delivery_rate_per_km;
        $rate = $vehicleRate !== null && $vehicleRate > 0
            ? $vehicleRate
            : (float) $settings->default_delivery_rate_per_km;

        $routeDistance = function (float $latitude, float $longitude, string $error) use ($originLat, $originLon): float {
            $route = Http::withOptions(['verify' => env('ROUTING_CA_BUNDLE', true)])
                ->timeout(8)
                ->get("https://router.project-osrm.org/route/v1/driving/{$originLon},{$originLat};{$longitude},{$latitude}", ['overview' => 'false']);
            abort_unless($route->successful() && $route->json('code') === 'Ok', 422, $error);

            return round(((float) $route->json('routes.0.distance')) / 1000, 2);
        };
        $deliveryDistance = $hasDelivery
            ? $routeDistance((float) $data['delivery_latitude'], (float) $data['delivery_longitude'], 'Unable to calculate the delivery distance. Please try another location.')
            : null;
        $returnDistance = $hasReturnPickup
            ? $routeDistance((float) $data['return_latitude'], (float) $data['return_longitude'], 'Unable to calculate the return pickup distance. Please try another location.')
            : null;

        return ['delivery_distance_km' => $deliveryDistance, 'delivery_rate_per_km' => $rate, 'delivery_fee' => $deliveryDistance === null ? 0 : round($deliveryDistance * $rate, 2), 'delivery_latitude' => $hasDelivery ? (float) $data['delivery_latitude'] : null, 'delivery_longitude' => $hasDelivery ? (float) $data['delivery_longitude'] : null, 'return_distance_km' => $returnDistance, 'return_pickup_fee' => $returnDistance === null ? 0 : round($returnDistance * 2 * $rate, 2)];
    }

    private function rentalBreakdown(Carbon|string $pickupAt, Carbon|string $returnAt, Vehicle $vehicle): array
    {
        $pickupAt = $pickupAt instanceof Carbon ? $pickupAt : Carbon::parse($pickupAt);
        $returnAt = $returnAt instanceof Carbon ? $returnAt : Carbon::parse($returnAt);
        $minutes = $pickupAt->diffInMinutes($returnAt);
        $days = intdiv($minutes, 24 * 60);
        $settings = FleetSetting::findOrFail(1);
        $remainingMinutes = $minutes % (24 * 60);
        $billableMinutes = max(0, $remainingMinutes - (int) $settings->late_return_grace_period_minutes);
        $remainingHours = (int) ceil($billableMinutes / 60);
        $hourlyRate = (float) ($vehicle->hour_extension_rate ?? $settings->default_hour_extension_rate);
        $extension = $remainingHours === 0 ? 0 : ($remainingHours >= $settings->full_day_extension_threshold_hours ? (float) $vehicle->daily_rate : $remainingHours * $hourlyRate);

        return ['rental' => max(1, $days) * (float) $vehicle->daily_rate, 'extension' => $extension];
    }
}
