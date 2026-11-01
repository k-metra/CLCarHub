<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\User;
use Illuminate\Support\Facades\Log;

class StaffAssignmentSmsService
{
    public function send(Booking $booking, User $staff): void
    {
        $sms = app(IprogSmsService::class);
        if (! $sms->configured() || ! $staff->phone) {
            Log::info('Staff assignment SMS skipped.', [
                'booking_id' => $booking->id,
                'staff_id' => $staff->id,
                'reason' => ! $sms->configured() ? 'iProgSMS is not configured.' : 'Staff account has no phone number.',
            ]);
            return;
        }

        $vehicle = $booking->vehicle;
        $vehicleDetails = $vehicle
            ? trim(sprintf(
                '%s, %s %s, plate %s',
                $vehicle->name ?: 'Vehicle',
                $vehicle->brand,
                $vehicle->model,
                $vehicle->plate_number,
            ))
            : 'Vehicle details unavailable';
        $message = sprintf(
            'CL CarHub: Booking %s assigned to you. Pickup: %s. Vehicle: %s. Open the CL CarHub admin dashboard, go to Bookings, and search for reference %s to view the full details.',
            $booking->reference,
            $booking->pickup_at?->format('M j, Y g:i A'),
            $vehicleDetails,
            $booking->reference,
        );

        try {
            $sms->send([$staff->phone], $message);
        } catch (\Throwable $exception) {
            Log::warning('Staff assignment SMS delivery failed.', [
                'booking_id' => $booking->id,
                'staff_id' => $staff->id,
                'message' => $exception->getMessage(),
            ]);
        }
    }
}
