<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\Partner;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class PartnerAssignmentSmsService
{
    public function send(Booking $booking): void
    {
        $booking->loadMissing('vehicle.partner');
        $partner = $booking->vehicle?->partner;
        $phone = $this->normalizePhone($partner?->contact_number);
        $url = config('services.sms_gateway.url');

        if (! $partner || ! $phone || ! $url) {
            Log::info('Partner assignment SMS skipped.', [
                'booking_id' => $booking->id,
                'partner_id' => $partner?->id,
                'reason' => ! $partner ? 'Vehicle is CL CarHub-owned.' : (! $url ? 'SMS gateway is not configured.' : 'Partner has no valid mobile number.'),
            ]);
            return;
        }

        $vehicle = $booking->vehicle;
        $vehicleDetails = trim(sprintf(
            '%s, %s %s, plate %s',
            $vehicle->name ?: 'Vehicle',
            $vehicle->brand,
            $vehicle->model,
            $vehicle->plate_number,
        ));
        $message = sprintf(
            'CL CarHub: Booking %s has been assigned to your %s. Pickup: %s. Please deliver the unit to the CL CarHub garage by %s (3 hours before pickup). Please review the booking in your Host Dashboard.',
            $booking->reference,
            $vehicleDetails,
            $booking->pickup_at?->format('M j, Y g:i A'),
            $booking->pickup_at?->copy()->subHours(3)->format('M j, Y g:i A'),
        );

        try {
            Http::timeout((int) config('services.sms_gateway.timeout', 10))
                ->withHeaders(['x-api-key' => config('services.sms_gateway.token')])
                ->post($url, [
                    'recipients' => [$phone],
                    'message' => $message,
                ])
                ->throw();
        } catch (\Throwable $exception) {
            Log::warning('Partner assignment SMS delivery failed.', [
                'booking_id' => $booking->id,
                'partner_id' => $partner->id,
                'message' => $exception->getMessage(),
            ]);
        }
    }

    public function normalizePhone(?string $phone): ?string
    {
        if (! $phone) {
            return null;
        }

        $digits = preg_replace('/\D+/', '', $phone);
        if (! is_string($digits)) {
            return null;
        }
        if (str_starts_with($digits, '00')) {
            $digits = substr($digits, 2);
        }
        if (str_starts_with($digits, '0')) {
            $digits = '63'.substr($digits, 1);
        } elseif (str_starts_with($digits, '9') && strlen($digits) === 10) {
            $digits = '63'.$digits;
        }

        return preg_match('/^639\d{9}$/', $digits) ? '+'.$digits : null;
    }
}
