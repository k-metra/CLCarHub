<?php

return [
    'aika' => [
        // The vendor's HTTPS certificate is currently expired. Keep this
        // configurable so it can be switched back when the certificate is renewed.
        'server' => env('AIKA_SERVER', 'http://en.aika168.com'),
        'ca_bundle' => env('AIKA_CA_BUNDLE'),
        'devices' => [
            '9175749144' => [
                'password' => env('AIKA_DEVICE_9175749144_PASSWORD'),
            ],
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Resend, Postmark, AWS, and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'google' => [
        'client_id' => env('GOOGLE_CLIENT_ID'),
        'client_secret' => env('GOOGLE_CLIENT_SECRET'),
        'redirect' => env('GOOGLE_REDIRECT_URI'),
    ],

    'facebook' => [
        'client_id' => env('FACEBOOK_CLIENT_ID'),
        'client_secret' => env('FACEBOOK_CLIENT_SECRET'),
        'redirect' => env('FACEBOOK_REDIRECT_URI'),
    ],

    'web_push' => [
        'subject' => env('WEB_PUSH_SUBJECT'),
        'public_key' => env('WEB_PUSH_PUBLIC_KEY'),
        'private_key' => env('WEB_PUSH_PRIVATE_KEY'),
    ],

];
