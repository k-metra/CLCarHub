<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SocialAccount;
use App\Models\User;
use App\Models\Customer;
use App\Support\AuditLogger;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Laravel\Socialite\Facades\Socialite;
use Throwable;

class OAuthController extends Controller
{
    private const PROVIDERS = ['google', 'facebook'];

    public function redirect(Request $request, string $provider): RedirectResponse
    {
        $this->validateProvider($provider);
        abort_unless(config("services.{$provider}.client_id") && config("services.{$provider}.client_secret"), 503, ucfirst($provider).' login is not configured.');

        $state = $this->encodeState([
            'return_to' => $this->safeReturnPath($request->query('return_to')),
        ]);

        $driver = Socialite::driver($provider)
            ->scopes($provider === 'facebook' ? ['email', 'public_profile'] : ['openid', 'email', 'profile']);

        return $driver->with(['state' => $state])->redirect();
    }

    public function callback(Request $request, string $provider): RedirectResponse
    {
        $this->validateProvider($provider);
        try {
            $profile = Socialite::driver($provider)->stateless()->user();
        $social = SocialAccount::where('provider', $provider)
            ->where('provider_user_id', $profile->getId())
            ->first();
        if ($social) {
            $user = $social->user;
            $firstLogin = $user->last_login_at === null;
            $user->update(['last_login_at' => now(), 'last_login_ip' => $request->ip()]);
            $code = Str::random(64);
            Cache::put('oauth-login:'.hash('sha256', $code), ['user_id' => $user->id, 'first_login' => $firstLogin], now()->addMinutes(2));
            return redirect()->to($this->frontendUrl().'/admin/login?oauth_code='.urlencode($code));
        }
        if (! $profile->getEmail()) {
                $pendingToken = Str::random(64);
                Cache::put('oauth-pending:'.hash('sha256', $pendingToken), [
                    'provider' => $provider,
                    'provider_user_id' => $profile->getId(),
                    'provider_name' => $profile->getName() ?: $profile->getNickname() ?: 'Facebook customer',
                    'provider_avatar_url' => $profile->getAvatar(),
                ], now()->addMinutes(15));
                return redirect()->to($this->frontendUrl().'/facebook/complete?token='.urlencode($pendingToken));
            }

            $raw = $profile->getRaw();
            $emailVerified = $provider === 'google'
                ? ($raw['email_verified'] ?? false) === true
                : true;
            abort_unless($emailVerified, 422, 'Verify your email address with '.$provider.' before using social login.');

            $user = DB::transaction(function () use ($profile, $provider, $request): User {
                $email = strtolower(trim((string) $profile->getEmail()));
                $user = User::whereRaw('lower(email) = ?', [$email])->first();
                if ($user && $user->role !== 'customer') {
                    $message = $user->role === 'host'
                        ? 'This email belongs to a host account. Use the host sign-in form.'
                        : 'This email belongs to a staff account. Use the staff sign-in form.';
                    abort(422, $message);
                }
                $unclaimedProfile = Customer::query()
                    ->whereNull('user_id')
                    ->whereRaw('lower(email) = ?', [$email])
                    ->lockForUpdate()
                    ->first();
                if (! $user) {
                    $username = $this->uniqueUsername($profile->getNickname() ?: $profile->getName() ?: Str::before($profile->getEmail(), '@'));
                    $user = User::create([
                        'name' => $profile->getName() ?: $username,
                        'username' => $username,
                        'email' => $email,
                        'password' => Str::random(40),
                        'role' => 'customer',
                        'status' => 'active',
                        'email_verified_at' => now(),
                    ]);
                    if ($unclaimedProfile) {
                        $unclaimedProfile->update([
                            'user_id' => $user->id,
                            'archived_at' => null,
                            'onboarding_completed_at' => null,
                        ]);
                    } else {
                        $user->customer()->create([
                            'name' => $user->name,
                            'email' => $user->email,
                        ]);
                    }
                }
                if ($user->role === 'customer' && ! $user->customer()->exists()) {
                    $user->customer()->create([
                        'name' => $user->name,
                        'email' => $user->email,
                    ]);
                }

                SocialAccount::create([
                    'user_id' => $user->id,
                    'provider' => $provider,
                    'provider_user_id' => $profile->getId(),
                    'provider_email' => $profile->getEmail(),
                    'provider_avatar_url' => $profile->getAvatar(),
                ]);

                return $user;
            });

            $firstLogin = $user->last_login_at === null;
            $user->update(['last_login_at' => now(), 'last_login_ip' => $request->ip()]);
            AuditLogger::record('account', 'login', "User logged in with {$provider}: {$user->name}", $user, null, $request);
            $code = Str::random(64);
            Cache::put('oauth-login:'.hash('sha256', $code), ['user_id' => $user->id, 'first_login' => $firstLogin], now()->addMinutes(2));

            $state = $this->decodeState($request->query('state'));
            $returnTo = $this->safeReturnPath($state['return_to'] ?? null);

            return redirect()->to($this->frontendUrl().'/admin/login?oauth_code='.urlencode($code).'&return_to='.urlencode($returnTo));
        } catch (Throwable $exception) {
            report($exception);

            $message = $exception->getMessage() ?: 'The social login provider could not complete the sign-in request.';

            return redirect()->to($this->frontendUrl().'/admin/login?oauth_error='.urlencode($message));
        }
    }

    public function exchange(Request $request)
    {
        $data = $request->validate(['code' => ['required', 'string', 'size:64']]);
        $payload = Cache::pull('oauth-login:'.hash('sha256', $data['code']));
        abort_unless(is_array($payload) && isset($payload['user_id']), 422, 'This social login has expired. Please try again.');

        $user = User::findOrFail($payload['user_id']);
        abort_unless($user->status === 'active', 403, 'This account is not active.');

        return ['user' => $user->load('customer'), 'token' => $user->createToken($user->role.'-session')->plainTextToken, 'first_login' => (bool) ($payload['first_login'] ?? false)];
    }

    public function sendPendingPhone(Request $request)
    {
        $data = $request->validate(['token' => ['required', 'string', 'size:64'], 'phone' => ['required', 'string', 'max:40']]);
        $key = 'oauth-pending:'.hash('sha256', $data['token']);
        $pending = Cache::get($key);
        abort_unless(is_array($pending), 422, 'This Facebook sign-in has expired. Please start again.');
        $phone = app(\App\Services\CustomerPhoneVerificationService::class)->normalizePhone($data['phone']);
        abort_unless($phone, 422, 'Enter a valid Philippine mobile number.');
        $url = config('services.sms_gateway.url');
        $smsToken = config('services.sms_gateway.token');
        abort_unless($url && $smsToken, 502, 'SMS verification is not configured.');
        $code = (string) random_int(100000, 999999);
        Http::timeout((int) config('services.sms_gateway.timeout', 10))
            ->withHeaders(['x-api-key' => $smsToken])
            ->post($url, ['recipients' => [$phone], 'message' => "CL CarHub: Your Facebook sign-in code is {$code}. It expires in 10 minutes. Do not share this code."])
            ->throw();
        Cache::put($key, [...$pending, 'phone' => $phone, 'phone_code_hash' => Hash::make($code), 'phone_code_expires_at' => now()->addMinutes(10)], now()->addMinutes(15));
        return ['phone' => $phone, 'message' => 'Verification code sent.'];
    }

    public function completePending(Request $request)
    {
        $data = $request->validate(['token' => ['required', 'string', 'size:64'], 'code' => ['required', 'digits:6']]);
        $key = 'oauth-pending:'.hash('sha256', $data['token']);
        $pending = Cache::pull($key);
        abort_unless(is_array($pending) && isset($pending['phone'], $pending['phone_code_hash']), 422, 'Request a new verification code first.');
        abort_if(now()->greaterThan(\Illuminate\Support\Carbon::parse($pending['phone_code_expires_at'])) || ! Hash::check($data['code'], $pending['phone_code_hash']), 422, 'The verification code is invalid or expired.');
        $user = DB::transaction(function () use ($pending): User {
            $social = SocialAccount::where('provider', $pending['provider'])->where('provider_user_id', $pending['provider_user_id'])->first();
            if ($social) return $social->user;
            $user = User::create(['name' => $pending['provider_name'], 'username' => $this->uniqueUsername($pending['provider_name']), 'email' => null, 'password' => Str::random(40), 'role' => 'customer', 'status' => 'active', 'email_verified_at' => now(), 'phone' => $pending['phone']]);
            $user->customer()->create(['name' => $pending['provider_name'], 'phone' => $pending['phone'], 'phone_verified_at' => now()]);
            SocialAccount::create(['user_id' => $user->id, 'provider' => $pending['provider'], 'provider_user_id' => $pending['provider_user_id'], 'provider_email' => null, 'provider_avatar_url' => $pending['provider_avatar_url']]);
            return $user;
        });
        $firstLogin = $user->last_login_at === null;
        $user->update(['last_login_at' => now(), 'last_login_ip' => $request->ip()]);
        return ['user' => $user->load('customer'), 'token' => $user->createToken('customer-session')->plainTextToken, 'first_login' => $firstLogin];
    }

    private function validateProvider(string $provider): void
    {
        abort_unless(in_array($provider, self::PROVIDERS, true), 404);
    }

    private function frontendUrl(): string
    {
        return rtrim(trim(explode(',', (string) config('app.frontend_url', 'http://localhost:5173'))[0]), '/');
    }

    private function safeReturnPath(?string $path): string
    {
        return is_string($path) && Str::startsWith($path, '/') && ! Str::startsWith($path, '//')
            ? $path
            : '/';
    }

    /**
     * @return array<string, mixed>
     */
    private function decodeState(mixed $state): array
    {
        if (! is_string($state) || $state === '') {
            return [];
        }

        $base64 = strtr($state, '-_', '+/');
        $decoded = base64_decode($base64.str_repeat('=', (4 - strlen($base64) % 4) % 4), true);
        if ($decoded === false) {
            return [];
        }

        $parts = explode('.', $decoded, 2);
        if (count($parts) !== 2 || ! hash_equals(hash_hmac('sha256', $parts[0], config('app.key')), $parts[1])) {
            return [];
        }

        $payload = json_decode($parts[0], true);

        return is_array($payload) ? $payload : [];
    }

    /**
     * @param array<string, mixed> $payload
     */
    private function encodeState(array $payload): string
    {
        $json = json_encode($payload, JSON_THROW_ON_ERROR);
        $signed = $json.'.'.hash_hmac('sha256', $json, config('app.key'));

        return rtrim(strtr(base64_encode($signed), '+/', '-_'), '=');
    }

    private function uniqueUsername(string $value): string
    {
        $base = Str::of($value)->lower()->replaceMatches('/[^a-z0-9_-]+/', '-')->trim('-')->substr(0, 42)->toString() ?: 'customer';
        $username = $base;
        $counter = 2;
        while (User::where('username', $username)->exists()) {
            $username = $base.'-'.$counter++;
        }

        return $username;
    }
}
