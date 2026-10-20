<?php

namespace App\Services;

use App\Models\Customer;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

class CustomerPhoneVerificationService
{
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

    public function sendCode(Customer $customer, string $phone): string
    {
        $url = config('services.sms_gateway.url');
        $token = config('services.sms_gateway.token');
        if (! $url || ! $token) {
            throw new RuntimeException('SMS verification is not configured.');
        }

        $code = (string) random_int(100000, 999999);
        $message = "CL CarHub: Your phone verification code is {$code}. It expires in 10 minutes. Do not share this code.";

        Http::timeout((int) config('services.sms_gateway.timeout', 10))
            ->withHeaders(['x-api-key' => $token])
            ->post($url, ['recipients' => [$phone], 'message' => $message])
            ->throw();

        $customer->update([
            'phone' => $phone,
            'phone_verified_at' => null,
            'phone_verification_code_hash' => Hash::make($code),
            'phone_verification_expires_at' => now()->addMinutes(10),
            'phone_verification_sent_at' => now(),
            'phone_verification_attempts' => 0,
        ]);

        Log::info('Customer phone verification code sent.', ['customer_id' => $customer->id]);

        return $phone;
    }

    public function verifyCode(Customer $customer, string $code): void
    {
        if (! $customer->phone_verification_code_hash || ! $customer->phone_verification_expires_at || $customer->phone_verification_expires_at->isPast()) {
            throw new RuntimeException('This verification code has expired. Request a new code.');
        }
        if ($customer->phone_verification_attempts >= 5) {
            throw new RuntimeException('Too many incorrect attempts. Request a new code.');
        }

        if (! Hash::check($code, $customer->phone_verification_code_hash)) {
            $customer->increment('phone_verification_attempts');
            throw new RuntimeException('The verification code is incorrect.');
        }

        $customer->update([
            'phone_verified_at' => now(),
            'phone_verification_code_hash' => null,
            'phone_verification_expires_at' => null,
            'phone_verification_sent_at' => null,
            'phone_verification_attempts' => 0,
        ]);
    }
}
