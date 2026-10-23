<?php

namespace App\Services;

use App\Models\RfidBalanceInquiry;
use App\Models\Vehicle;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use RuntimeException;

class EasytripBalanceService
{
    private const RECIPIENT = '+639191601553';
    private const TIMEOUT_SECONDS = 90;

    public function request(Vehicle $vehicle): RfidBalanceInquiry
    {
        if (! $vehicle->rfid_enabled || $vehicle->rfid_provider !== 'easytrip' || ! $vehicle->rfid_account_number) {
            throw new RuntimeException('Easytrip RFID is not configured for this vehicle.');
        }

        $url = config('services.sms_gateway.url');
        $token = config('services.sms_gateway.token');
        if (! $url || ! $token) {
            throw new RuntimeException('The SMS gateway is not configured.');
        }

        $accountNumber = trim($vehicle->rfid_account_number);
        RfidBalanceInquiry::query()
            ->where('status', 'pending')
            ->where('expires_at', '<=', now())
            ->update(['status' => 'timed_out', 'completed_at' => now()]);

        if (RfidBalanceInquiry::query()
            ->where('provider', 'easytrip')
            ->where('status', 'pending')
            ->where('expires_at', '>', now())
            ->exists()) {
            throw new RuntimeException('Another Easytrip balance inquiry is already in progress.');
        }

        $inquiry = RfidBalanceInquiry::create([
            'vehicle_id' => $vehicle->id,
            'provider' => 'easytrip',
            'account_hash' => hash('sha256', $accountNumber),
            'account_number' => $accountNumber,
            'status' => 'pending',
            'requested_at' => now(),
            'expires_at' => now()->addSeconds(self::TIMEOUT_SECONDS),
        ]);

        try {
            Http::timeout((int) config('services.sms_gateway.timeout', 10))
                ->withHeaders(['x-api-key' => $token])
                ->post($url, [
                    'recipients' => [self::RECIPIENT],
                    'message' => "BAL {$accountNumber}",
                ])
                ->throw();
        } catch (\Throwable $exception) {
            $inquiry->update(['status' => 'failed', 'completed_at' => now()]);
            Log::warning('Easytrip RFID inquiry SMS failed.', [
                'vehicle_id' => $vehicle->id,
                'inquiry_id' => $inquiry->id,
                'message' => $exception->getMessage(),
            ]);
            throw new RuntimeException('The Easytrip inquiry could not be sent.', 0, $exception);
        }

        return $inquiry;
    }

    public function result(RfidBalanceInquiry $inquiry): array
    {
        if ($inquiry->status === 'pending' && $inquiry->expires_at->isPast()) {
            $inquiry->update(['status' => 'timed_out', 'completed_at' => now()]);
        }

        return [
            'id' => $inquiry->id,
            'status' => $inquiry->status,
            'provider' => $inquiry->provider,
            'balance' => $inquiry->balance !== null ? (float) $inquiry->balance : null,
            'retrieved_at' => $inquiry->completed_at?->toIso8601String(),
            'message' => match ($inquiry->status) {
                'pending' => 'Inquiring balance by SMS.',
                'completed' => null,
                'timed_out' => 'Easytrip did not return a balance within 1 minute and 30 seconds.',
                default => 'The Easytrip response could not be processed.',
            },
        ];
    }

    public function handleIncomingMessage(array $payload): bool
    {
        $messages = $this->findStringValues($payload, ['message', 'text', 'body', 'content']);
        $senders = $this->findStringValues($payload, ['senderName', 'sender_name', 'contactName', 'contact_name', 'sender', 'from', 'originator']);
        $message = trim($messages[0] ?? '');
        $sender = Str::lower(implode(' ', $senders));
        $messageIds = $this->findStringValues($payload, ['smsId', 'messageId', 'id']);
        $messageId = $messageIds[0] ?? '';

        if ($message === '' || ! Str::contains($sender, 'easytrip')) {
            Log::warning('Easytrip webhook ignored: sender or message did not match.', [
                'sender' => $sender,
                'has_message' => $message !== '',
            ]);
            return false;
        }

        $inquiry = RfidBalanceInquiry::query()
            ->where('provider', 'easytrip')
            ->where('status', 'pending')
            ->where('expires_at', '>', now())
            ->latest('requested_at')
            ->get()
            ->first(fn (RfidBalanceInquiry $candidate) => $this->messageMatchesAccount($message, $candidate->account_number));

        if (! $inquiry) {
            Log::warning('Easytrip webhook ignored: no pending inquiry matched.', [
                'message_id' => $messageId,
            ]);
            return false;
        }

        $balance = $this->parseBalance($message);
        if ($balance === null) {
            Log::warning('Easytrip webhook ignored: balance could not be parsed.', [
                'inquiry_id' => $inquiry->id,
                'message_id' => $messageId,
            ]);
            return false;
        }

        $inquiry->update([
            'status' => 'completed',
            'message_id' => $messageId !== '' ? $messageId : null,
            'balance' => $balance,
            'completed_at' => now(),
        ]);
        $inquiry->vehicle()->update([
            'rfid_balance' => $balance,
            'rfid_balance_retrieved_at' => now(),
        ]);

        return true;
    }

    private function messageMatchesAccount(string $message, string $accountNumber): bool
    {
        return Str::contains(preg_replace('/\D+/', '', $message), preg_replace('/\D+/', '', $accountNumber))
            || ! preg_match('/\b\d{8,}\b/', $message);
    }

    private function parseBalance(string $message): ?float
    {
        $patterns = [
            '/(?:load\s+)?balance.*?\bis\s+([\d,]+(?:\.\d{1,2})?)/i',
            '/(?:balance|load|remaining\s+load|available\s+balance)\D+([\d,]+(?:\.\d{1,2})?)/i',
            '/(?:PHP|PHP\s*)\D*([\d,]+(?:\.\d{1,2})?)/i',
        ];
        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $message, $matches)) {
                return (float) str_replace(',', '', $matches[1]);
            }
        }

        return null;
    }

    private function findStringValues(array $payload, array $keys): array
    {
        $values = [];
        foreach ($payload as $key => $value) {
            if (in_array((string) $key, $keys, true) && is_scalar($value)) {
                $values[] = (string) $value;
            } elseif (is_array($value)) {
                $values = [...$values, ...$this->findStringValues($value, $keys)];
            }
        }

        return $values;
    }
}
