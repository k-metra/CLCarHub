<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use RuntimeException;

class UserPhoneVerificationService
{
    private const CODE_TTL_MINUTES = 30;

    public function normalizePhone(?string $phone): ?string
    {
        return app(CustomerPhoneVerificationService::class)->normalizePhone($phone);
    }

    public function sendCode(User $user, string $phone): string
    {
        $sms = app(IprogSmsService::class);
        if (! $sms->configured()) {
            throw new RuntimeException('SMS verification is not configured.');
        }

        $code = (string) random_int(100000, 999999);
        $sms->send([$phone], "CL CarHub: Your phone verification code is {$code}. It expires in 30 minutes. Do not share this code.");

        $user->update([
            'phone' => $phone,
            'phone_verified_at' => null,
            'phone_verification_code_hash' => Hash::make($code),
            'phone_verification_expires_at' => now()->addMinutes(self::CODE_TTL_MINUTES),
            'phone_verification_sent_at' => now(),
            'phone_verification_attempts' => 0,
        ]);

        Log::info('User phone verification code sent.', ['user_id' => $user->id]);

        return $phone;
    }

    public function verifyCode(User $user, string $code): void
    {
        if (! $user->phone_verification_code_hash || ! $user->phone_verification_expires_at) {
            Log::warning('User phone verification state is missing.', [
                'user_id' => $user->id,
                'has_code_hash' => (bool) $user->phone_verification_code_hash,
                'expires_at' => $user->getRawOriginal('phone_verification_expires_at'),
            ]);
            throw new RuntimeException('No active verification code was found. Request a new code.');
        }
        if ($user->phone_verification_expires_at->isPast()) {
            Log::warning('User phone verification code expired.', [
                'user_id' => $user->id,
                'now' => now()->toIso8601String(),
                'expires_at' => $user->phone_verification_expires_at->toIso8601String(),
                'raw_expires_at' => $user->getRawOriginal('phone_verification_expires_at'),
            ]);
            throw new RuntimeException('This verification code has expired. Request a new code.');
        }
        if ($user->phone_verification_attempts >= 5) {
            throw new RuntimeException('Too many incorrect attempts. Request a new code.');
        }
        if (! Hash::check($code, $user->phone_verification_code_hash)) {
            $user->increment('phone_verification_attempts');
            throw new RuntimeException('The verification code is incorrect.');
        }

        $user->update([
            'phone_verified_at' => now(),
            'phone_verification_code_hash' => null,
            'phone_verification_expires_at' => null,
            'phone_verification_sent_at' => null,
            'phone_verification_attempts' => 0,
        ]);
    }
}
