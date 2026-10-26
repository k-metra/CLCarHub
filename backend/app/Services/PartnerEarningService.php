<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\PartnerEarning;

class PartnerEarningService
{
    public function syncUnpaidForBooking(Booking $booking): void
    {
        $earning = PartnerEarning::query()->where('booking_id', $booking->id)->first();
        if (! $earning || ! in_array($earning->status, ['pending', 'approved'], true)) {
            return;
        }

        $this->applyAmounts($earning, $booking);
    }

    public function createForCompletedBooking(Booking $booking): void
    {
        $booking->loadMissing(['vehicle.partner', 'contract']);
        $partner = $booking->vehicle?->partner;

        if (! $partner || PartnerEarning::where('booking_id', $booking->id)->exists()) {
            return;
        }

        $earning = new PartnerEarning([
            'partner_id' => $partner->id,
            'vehicle_id' => $booking->vehicle_id,
            'booking_id' => $booking->id,
            'status' => 'pending',
            'earned_at' => now()->toDateString(),
        ]);
        $this->applyAmounts($earning, $booking, $partner);
    }

    private function applyAmounts(PartnerEarning $earning, Booking $booking, $partner = null): void
    {
        $partner ??= $earning->partner()->firstOrFail();
        $grossAmount = $this->grossAmount($booking, $partner);
        $partnerShare = $partner->commission_type === 'fixed_amount'
            ? (float) $partner->commission_value
            : $grossAmount * ((float) $partner->commission_value / 100);
        $partnerShare = min($partnerShare, $grossAmount);

        $earning->fill([
            'gross_amount' => round($grossAmount, 2),
            'commission_amount' => round(max(0, $grossAmount - $partnerShare), 2),
            'net_amount' => round($partnerShare, 2),
        ])->save();
    }

    private function grossAmount(Booking $booking, $partner): float
    {
        $hostRate = $booking->contract?->host_view_published
            ? $booking->contract->host_details['rate'] ?? null
            : null;
        $rentalAmount = $hostRate === null
            ? (float) $booking->rental_amount
            : (float) $hostRate * max(1, $booking->pickup_at->diffInDays($booking->return_at));

        if ($partner->commission_based_on !== 'total_booking_amount') {
            return $rentalAmount;
        }

        $bookingTotal = $hostRate === null
            ? (float) $booking->total_amount
            : (float) $booking->total_amount - (float) $booking->rental_amount + $rentalAmount;

        return max(0, $bookingTotal - $this->cashSecurityDeposit($booking));
    }

    private function cashSecurityDeposit(Booking $booking): float
    {
        return ($booking->security_deposit_type ?? 'cash') === 'cash'
            ? (float) $booking->deposit
            : 0;
    }
}
