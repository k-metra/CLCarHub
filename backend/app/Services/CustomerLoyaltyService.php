<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\CustomerLoyaltyReward;

class CustomerLoyaltyService
{
    public function sync(Customer $customer): void
    {
        $completed = $customer->bookings()->where('status', Booking::COMPLETE)->count();
        for ($milestone = 5; $milestone <= $completed; $milestone += 5) {
            CustomerLoyaltyReward::firstOrCreate(
                ['customer_id' => $customer->id, 'milestone_booking_count' => $milestone],
                ['status' => 'available'],
            );
        }
    }

    public function summary(Customer $customer): array
    {
        $this->sync($customer);
        $completed = $customer->bookings()->where('status', Booking::COMPLETE)->count();
        $available = $customer->loyaltyRewards()->where('status', 'available')->count();

        return [
            'completed_bookings' => $completed,
            'bookings_toward_next_reward' => $completed % 5,
            'bookings_remaining' => 5 - ($completed % 5 ?: 5),
            'available_rewards' => $available,
            'reward_description' => 'Free 12-hour rental',
        ];
    }

    public function redeem(Customer $customer, Booking $booking): void
    {
        $this->sync($customer);
        $reward = $customer->loyaltyRewards()
            ->where('status', 'available')
            ->lockForUpdate()
            ->first();
        abort_unless($reward, 422, 'This customer has no available loyalty reward.');
        $reward->update(['status' => 'redeemed', 'redeemed_booking_id' => $booking->id]);
    }
}
