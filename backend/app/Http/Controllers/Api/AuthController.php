<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

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
        return $request->user();
    }
}
