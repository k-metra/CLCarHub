<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class StaffAssignmentSmsService
{
    public function send(Booking $booking, User $staff): void
    {
        $url = config('services.sms_gateway.url');
        if (! $url || ! $staff->phone) {
            Log::info('Staff assignment SMS skipped.', [
                'booking_id' => $booking->id,
                'staff_id' => $staff->id,
                'reason' => ! $url ? 'SMS gateway is not configured.' : 'Staff account has no phone number.',
            ]);
            return;
        }

        $message = sprintf(
            'CL CarHub: Booking %s has been assigned to you. Pickup: %s. Vehicle: %s.',
            $booking->reference,
            $booking->pickup_at?->format('M j, Y g:i A'),
            trim(($booking->vehicle?->brand ?? '').' '.($booking->vehicle?->model ?? '')),
        );

        try {
            $response = Http::timeout((int) config('services.sms_gateway.timeout', 10))
                ->withHeaders(['x-api-key' => config('services.sms_gateway.token')])
                ->post($url, [
                    'recipients' => [$staff->phone],
                    'message' => $message,
                ]);

            $response->throw();
        } catch (\Throwable $exception) {
            Log::warning('Staff assignment SMS delivery failed.', [
                'booking_id' => $booking->id,
                'staff_id' => $staff->id,
                'message' => $exception->getMessage(),
            ]);
        }
    }
}
