<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;

class IprogSmsService
{
    public function configured(): bool
    {
        return filled(config('services.iprogsms.url'))
            && filled(config('services.iprogsms.api_token'));
    }

    /**
     * @param  array<int, string>  $recipients
     */
    public function send(array $recipients, string $message): void
    {
        $url = config('services.iprogsms.url');
        $token = config('services.iprogsms.api_token');
        if (! $url || ! $token) {
            throw new RuntimeException('iProgSMS is not configured.');
        }

        foreach ($recipients as $recipient) {
            $phoneNumber = $this->normalizePhone($recipient);
            if ($phoneNumber === null) {
                throw new RuntimeException('iProgSMS requires valid Philippine mobile numbers.');
            }

            Http::asForm()
                ->timeout((int) config('services.iprogsms.timeout', 10))
                ->post($url, [
                    'api_token' => $token,
                    'phone_number' => $phoneNumber,
                    'message' => $message,
                ])
                ->throw();
        }
    }

    /**
     * @param  array<int, string>  $recipients
     */
    public function sendBulk(array $recipients, string $message): void
    {
        $url = config('services.iprogsms.bulk_url')
            ?: rtrim((string) config('services.iprogsms.url'), '/').'/send_bulk';
        $token = config('services.iprogsms.api_token');
        if (! $url || ! $token) {
            throw new RuntimeException('iProgSMS is not configured.');
        }

        $phoneNumbers = collect($recipients)
            ->map(fn (string $recipient): ?string => $this->normalizePhone($recipient))
            ->filter()
            ->unique()
            ->values()
            ->implode(',');

        if ($phoneNumbers === '') {
            throw new RuntimeException('iProgSMS requires valid Philippine mobile numbers.');
        }

        Http::asForm()
            ->timeout((int) config('services.iprogsms.timeout', 10))
            ->post($url, [
                'api_token' => $token,
                'phone_numbers' => $phoneNumbers,
                'message' => $message,
            ])
            ->throw();
    }

    private function normalizePhone(string $phone): ?string
    {
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

        return preg_match('/^639\d{9}$/', $digits) ? $digits : null;
    }
}
