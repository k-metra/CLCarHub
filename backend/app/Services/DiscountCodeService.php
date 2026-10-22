<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\DiscountCode;
use App\Models\DiscountCodeRedemption;
use App\Models\Vehicle;
use Illuminate\Support\Carbon;

class DiscountCodeService
{
    public function findEligible(string $code, Customer $customer, Vehicle $vehicle, float $baseRental, int $durationHours): DiscountCode
    {
        $discount = DiscountCode::whereRaw('LOWER(code) = ?', [strtolower(trim($code))])->lockForUpdate()->first();
        abort_unless($discount, 422, 'The discount code is invalid.');
        $now = now();
        $status = $this->effectiveStatus($discount, $now);
        abort_unless($status === 'active', 422, 'This discount code is not active.');
        abort_if($discount->starts_at && $now->lt($discount->starts_at), 422, 'This discount code is not active yet.');
        abort_if($discount->ends_at && $now->gt($discount->ends_at), 422, 'This discount code has expired.');
        abort_if($discount->redemptions_allowed !== null && $discount->redemptions_count >= $discount->redemptions_allowed, 422, 'This discount code has been exhausted.');
        abort_if($discount->minimum_booking_amount !== null && $baseRental < (float) $discount->minimum_booking_amount, 422, 'The booking does not meet the minimum amount for this discount code.');
        abort_if($discount->minimum_duration_hours !== null && $durationHours < $discount->minimum_duration_hours, 422, 'The booking does not meet the minimum duration for this discount code.');
        abort_if($discount->vehicle_types && ! in_array($vehicle->type, $discount->vehicle_types, true), 422, 'This discount code does not apply to the selected vehicle category.');
        abort_if($discount->new_customers_only && $customer->bookings()->whereNotIn('status', [Booking::CANCELLED, Booking::REJECTED])->exists(), 422, 'This discount code is for new customers only.');
        if ($discount->customers()->exists()) {
            abort_unless($discount->customers()->whereKey($customer->id)->exists(), 422, 'This discount code is not available to this customer.');
        }
        abort_if($discount->redemptions()->where('customer_id', $customer->id)->count() >= $discount->limit_per_customer, 422, 'This customer has already reached the limit for this discount code.');

        return $discount;
    }

    public function amount(DiscountCode $discount, float $baseRental): float
    {
        $amount = $discount->type === 'percentage'
            ? $baseRental * ((float) $discount->value / 100)
            : (float) $discount->value;

        return round(min($baseRental, $discount->maximum_discount === null ? $amount : min($amount, (float) $discount->maximum_discount)), 2);
    }

    public function redeem(DiscountCode $discount, Customer $customer, Booking $booking, float $amount): void
    {
        DiscountCodeRedemption::create([
            'discount_code_id' => $discount->id,
            'customer_id' => $customer->id,
            'booking_id' => $booking->id,
            'amount' => $amount,
        ]);
        $discount->increment('redemptions_count');
        if ($discount->redemptions_allowed !== null && $discount->redemptions_count >= $discount->redemptions_allowed) {
            $discount->update(['status' => 'exhausted']);
        }
    }

    public function effectiveStatus(DiscountCode $discount, ?Carbon $now = null): string
    {
        if (in_array($discount->status, ['draft', 'paused', 'exhausted'], true)) return $discount->status;
        if ($discount->ends_at && ($now ?? now())->gt($discount->ends_at)) return 'expired';
        if ($discount->starts_at && ($now ?? now())->lt($discount->starts_at)) return 'scheduled';
        return $discount->status === 'scheduled' ? 'active' : $discount->status;
    }
}
