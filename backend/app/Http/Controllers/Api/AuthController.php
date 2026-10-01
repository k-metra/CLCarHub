<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $data = $request->validate(['email' => ['required', 'email'], 'password' => ['required', 'string']]);
        $user = User::where('email', $data['email'])->first();
        abort_unless($user && $user->status === 'active' && Hash::check($data['password'], $user->password), 422, 'The provided credentials are incorrect.');
        abort_if($user->role === 'customer' && ! $user->hasVerifiedEmail(), 403, 'Please verify your email address before signing in.');
        $user->update(['last_login_at' => now()]);

        return ['user' => $user, 'token' => $user->createToken($user->role.'-session')->plainTextToken];
    }

    public function register(Request $request)
    {
        $data = $request->validate([
            'username' => ['required', 'string', 'min:3', 'max:50', 'alpha_dash', 'unique:users,username'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'confirmed', 'min:8'],
            'phone' => ['nullable', 'string', 'max:40'],
        ]);

        $user = DB::transaction(function () use ($data) {
            $user = User::create([
                'name' => $data['username'],
                'username' => $data['username'],
                'email' => $data['email'],
                'password' => $data['password'],
                'role' => 'customer',
                'status' => 'active',
            ]);
            $user->customer()->create(['name' => $data['username'], 'email' => $data['email'], 'phone' => $data['phone'] ?? null]);

            return $user;
        });

        $user->sendEmailVerificationNotification();

        return response()->json(['message' => 'Registration successful. Please verify your email before signing in.'], 201);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->noContent();
    }

    public function user(Request $request)
    {
        return $request->user()->load('customer.attachments');
    }

    public function profile(Request $request)
    {
        return $request->user()->only(['id', 'name', 'first_name', 'middle_name', 'last_name', 'date_of_birth', 'username', 'email', 'role', 'email_verified_at']);
    }

    public function updateProfile(Request $request)
    {
        $user = $request->user();
        $data = $request->validate([
            'first_name' => ['required', 'string', 'max:100'],
            'middle_name' => ['nullable', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'date_of_birth' => ['nullable', 'date'],
            'username' => ['required', 'string', 'min:3', 'max:50', 'alpha_dash', Rule::unique('users', 'username')->ignore($user->id)],
        ]);
        $data['name'] = trim(implode(' ', array_filter([$data['first_name'], $data['middle_name'] ?? null, $data['last_name']])));
        $user->update($data);
        if ($user->customer) {
            $user->customer->update([
                'name' => $data['name'],
                'first_name' => $data['first_name'],
                'middle_name' => $data['middle_name'] ?? null,
                'last_name' => $data['last_name'],
                'date_of_birth' => $data['date_of_birth'] ?? null,
            ]);
        }

        return $this->profile($request);
    }

    public function changePassword(Request $request)
    {
        $user = $request->user();
        abort_unless($user->hasVerifiedEmail(), 403, 'Verify your email address before changing your password.');
        $data = $request->validate([
            'current_password' => ['required', 'current_password'],
            'password' => ['required', 'confirmed', 'min:8'],
        ]);
        $user->update(['password' => Hash::make($data['password'])]);

        return ['message' => 'Password changed successfully.'];
    }

    public function resendVerification(Request $request)
    {
        abort_if($request->user()->hasVerifiedEmail(), 422, 'Your email address is already verified.');
        $request->user()->sendEmailVerificationNotification();

        return ['message' => 'Verification email sent.'];
    }
}
