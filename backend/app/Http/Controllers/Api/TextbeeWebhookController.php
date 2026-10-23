<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\EasytripBalanceService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use JsonException;

class TextbeeWebhookController extends Controller
{
    public function inbound(Request $request, EasytripBalanceService $service)
    {
        $secret = config('services.sms_gateway.webhook_secret');
        $rawBody = $request->getContent();
        $signature = (string) $request->header('X-Signature');
        $expectedSignature = $secret !== ''
            ? hash_hmac('sha256', $rawBody, $secret)
            : '';

        if ($secret === '' || $signature === '' || ! hash_equals($expectedSignature, $signature)) {
            abort(403, 'Invalid webhook signature.');
        }

        $payload = $request->all();
        if ($payload === []) {
            $rawBody = trim($rawBody);
            if ($rawBody !== '') {
                try {
                    $decoded = json_decode($rawBody, true, 512, JSON_THROW_ON_ERROR);
                    $payload = is_array($decoded) ? $decoded : [];
                } catch (JsonException) {
                    parse_str($rawBody, $formPayload);
                    $payload = is_array($formPayload) ? $formPayload : [];
                }
            }
        }

        Log::info('TextBee webhook received.', [
            'content_type' => $request->header('Content-Type'),
            'payload_keys' => array_keys($payload),
        ]);

        $processed = $service->handleIncomingMessage($payload);

        return response()->json(['received' => true, 'processed' => $processed]);
    }
}
