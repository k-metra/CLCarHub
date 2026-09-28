<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $data = $request->validate(['email' => ['required', 'email'], 'password' => ['required', 'string']]);
        $user = User::where('email', $data['email'])->first();
        abort_unless($user && $user->status === 'active' && Hash::check($data['password'], $user->password), 422, 'The provided credentials are incorrect.');
        $user->update(['last_login_at' => now()]);

        return ['user' => $user, 'token' => $user->createToken('admin-dashboard')->plainTextToken];
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
