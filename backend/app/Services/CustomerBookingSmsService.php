<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\FleetSetting;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class CustomerBookingSmsService
{
    public function send(Booking $booking): void
    {
        $settings = FleetSetting::first();
        $url = config('services.sms_gateway.url');
        $recipients = collect($settings?->booking_sms_numbers ?? [])
            ->map(fn (string $number): ?string => $this->normalizePhone($number))
            ->filter()
            ->unique()
            ->values()
            ->all();

        if (! $url || $recipients === []) {
            Log::info('Customer booking SMS skipped.', [
                'booking_id' => $booking->id,
                'reason' => ! $url ? 'SMS gateway is not configured.' : 'No booking SMS recipients configured.',
            ]);
            return;
        }

        $booking->loadMissing(['vehicle', 'customer']);
        $vehicle = $booking->vehicle;
        $customerName = $booking->customer?->name ?: 'Customer';
        $vehicleDetails = $vehicle
            ? trim(sprintf('%s, %s %s, plate %s', $vehicle->name ?: 'Vehicle', $vehicle->brand, $vehicle->model, $vehicle->plate_number))
            : 'Vehicle details unavailable';
        $message = sprintf(
            'CL CarHub: New customer booking %s from %s. Pickup: %s. Vehicle: %s. Please review it in the admin dashboard.',
            $booking->reference,
            $customerName,
            $booking->pickup_at?->format('M j, Y g:i A'),
            $vehicleDetails,
        );

        try {
            Http::timeout((int) config('services.sms_gateway.timeout', 10))
                ->withHeaders(['x-api-key' => config('services.sms_gateway.token')])
                ->post($url, ['recipients' => $recipients, 'message' => $message])
                ->throw();
        } catch (\Throwable $exception) {
            Log::warning('Customer booking SMS delivery failed.', [
                'booking_id' => $booking->id,
                'message' => $exception->getMessage(),
            ]);
        }
    }

    public function normalizePhone(?string $phone): ?string
    {
        if (! is_string($phone) || ! preg_match('/^(?:\+63|0)?9\d{9}$/', $phone)) {
            return null;
        }

        $digits = ltrim($phone, '+');
        if (str_starts_with($digits, '0')) {
            $digits = substr($digits, 1);
        }
        if (str_starts_with($digits, '9') && strlen($digits) === 10) {
            $digits = '63'.$digits;
        }

        return '+'.$digits;
    }
}
