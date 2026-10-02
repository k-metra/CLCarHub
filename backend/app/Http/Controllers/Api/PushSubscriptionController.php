<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PushSubscription;
use Illuminate\Http\Request;

class PushSubscriptionController extends Controller
{
    public function config()
    {
        return response()->json(['public_key' => config('services.web_push.public_key')]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'endpoint' => ['required', 'url', 'max:2000'],
            'keys.p256dh' => ['required', 'string', 'max:500'],
            'keys.auth' => ['required', 'string', 'max:500'],
            'contentEncoding' => ['nullable', 'string', 'max:30'],
        ]);
        PushSubscription::updateOrCreate(
            ['user_id' => $request->user()->id, 'endpoint_hash' => hash('sha256', $data['endpoint'])],
            ['endpoint' => $data['endpoint'], 'public_key' => $data['keys']['p256dh'], 'auth_token' => $data['keys']['auth'], 'content_encoding' => $data['contentEncoding'] ?? 'aes128gcm'],
        );

        return response()->noContent();
    }

    public function destroy(Request $request)
    {
        $request->validate(['endpoint' => ['required', 'url', 'max:2000']]);
        PushSubscription::where('user_id', $request->user()->id)->where('endpoint', $request->endpoint)->delete();

        return response()->noContent();
    }
}
