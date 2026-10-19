<?php

namespace App\Services;

use App\Models\PartnerPayout;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class PartnerPayoutSmsService
{
    public function send(PartnerPayout $payout): void
    {
        $payout->loadMissing(['partner', 'payoutMethod']);
        $partner = $payout->partner;
        $phone = app(PartnerAssignmentSmsService::class)->normalizePhone($partner?->contact_number);
        $url = config('services.sms_gateway.url');

        if ($payout->payout_sms_sent_at || ! $partner || ! $phone || ! $url) {
            Log::info('Partner payout SMS skipped.', [
                'payout_id' => $payout->id,
                'partner_id' => $partner?->id,
                'reason' => $payout->payout_sms_sent_at ? 'Notification already sent.' : (! $partner ? 'Partner unavailable.' : (! $url ? 'SMS gateway is not configured.' : 'Partner has no valid mobile number.')),
            ]);
            return;
        }

        $method = $payout->payoutMethod;
        $destination = $method
            ? sprintf('%s ending in %s', $method->provider_name, substr($method->account_number, -4))
            : 'the selected payout destination';
        $message = sprintf(
            'CL CarHub: Your payout of PHP %s has been credited to %s.%s',
            number_format((float) $payout->amount, 2),
            $destination,
            $payout->payment_reference ? " Reference: {$payout->payment_reference}." : '',
        );

        try {
            Http::timeout((int) config('services.sms_gateway.timeout', 10))
                ->withHeaders(['x-api-key' => config('services.sms_gateway.token')])
                ->post($url, [
                    'recipients' => [$phone],
                    'message' => $message,
                ])
                ->throw();

            $payout->update(['payout_sms_sent_at' => now()]);
        } catch (\Throwable $exception) {
            Log::warning('Partner payout SMS delivery failed.', [
                'payout_id' => $payout->id,
                'partner_id' => $partner->id,
                'message' => $exception->getMessage(),
            ]);
        }
    }
}
