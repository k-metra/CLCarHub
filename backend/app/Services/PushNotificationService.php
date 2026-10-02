<?php

namespace App\Services;

use App\Models\PushSubscription;
use Illuminate\Support\Facades\Log;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;

class PushNotificationService
{
    public function sendToAdmins(string $title, string $body, string $url, string $key): void
    {
        $publicKey = config('services.web_push.public_key');
        $privateKey = config('services.web_push.private_key');
        $subject = config('services.web_push.subject');
        if (! $publicKey || ! $privateKey || ! $subject) {
            return;
        }

        try {
            $webPush = new WebPush(['VAPID' => [
                'subject' => $subject,
                'publicKey' => $publicKey,
                'privateKey' => $privateKey,
            ]]);
            $payload = json_encode(compact('title', 'body', 'url', 'key'), JSON_THROW_ON_ERROR);
            $subscriptions = PushSubscription::whereHas('user', fn ($query) => $query->whereIn('role', ['owner', 'co_owner', 'it_management', 'staff']))->get();
            foreach ($subscriptions as $subscription) {
                $webPush->queueNotification(
                    Subscription::create([
                        'endpoint' => $subscription->endpoint,
                        'publicKey' => $subscription->public_key,
                        'authToken' => $subscription->auth_token,
                        'contentEncoding' => $subscription->content_encoding,
                    ]),
                    $payload,
                );
            }

            foreach ($webPush->flush() as $report) {
                if ($report->isSubscriptionExpired()) {
                    $subscription = $subscriptions->first(fn ($item) => $item->endpoint === $report->getEndpoint());
                    $subscription?->delete();
                } elseif (! $report->isSuccess()) {
                    Log::warning('Web push delivery failed.', ['endpoint' => $report->getEndpoint(), 'reason' => $report->getReason()]);
                }
            }
        } catch (\Throwable $exception) {
            Log::warning('Web push notification could not be sent.', ['message' => $exception->getMessage()]);
        }
    }
}
