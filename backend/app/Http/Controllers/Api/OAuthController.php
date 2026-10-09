<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SocialAccount;
use App\Models\User;
use App\Support\AuditLogger;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
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

        return Socialite::driver($provider)->with(['state' => $state])->redirect();
    }

    public function callback(Request $request, string $provider): RedirectResponse
    {
        $this->validateProvider($provider);
        try {
            $profile = Socialite::driver($provider)->stateless()->user();
            abort_unless($profile->getEmail(), 422, 'The '.$provider.' account did not provide an email address.');

            $raw = $profile->getRaw();
            $emailVerified = $provider === 'google'
                ? ($raw['email_verified'] ?? false) === true
                : true;
            abort_unless($emailVerified, 422, 'Verify your email address with '.$provider.' before using social login.');

            $user = DB::transaction(function () use ($profile, $provider, $request): User {
                $social = SocialAccount::where('provider', $provider)
                    ->where('provider_user_id', $profile->getId())
                    ->first();
                if ($social) {
                    return $social->user;
                }

                $user = User::where('email', $profile->getEmail())->first();
                if ($user && $user->role !== 'customer') {
                    abort(422, 'This email belongs to a staff account. Use the staff sign-in form.');
                }
                if (! $user) {
                    $username = $this->uniqueUsername($profile->getNickname() ?: $profile->getName() ?: Str::before($profile->getEmail(), '@'));
                    $user = User::create([
                        'name' => $profile->getName() ?: $username,
                        'username' => $username,
                        'email' => $profile->getEmail(),
                        'password' => Str::random(40),
                        'role' => 'customer',
                        'status' => 'active',
                        'email_verified_at' => now(),
                    ]);
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

            $user->update(['last_login_at' => now(), 'last_login_ip' => $request->ip()]);
            AuditLogger::record('account', 'login', "User logged in with {$provider}: {$user->name}", $user, null, $request);
            $code = Str::random(64);
            Cache::put('oauth-login:'.hash('sha256', $code), ['user_id' => $user->id], now()->addMinutes(2));

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

        return ['user' => $user, 'token' => $user->createToken($user->role.'-session')->plainTextToken];
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
