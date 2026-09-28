<?php

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/email/verify/{id}/{hash}', function (Request $request, int $id, string $hash) {
    $user = User::findOrFail($id);
    abort_unless(hash_equals((string) $hash, sha1($user->getEmailForVerification())), 403);
    $user->markEmailAsVerified();

    return redirect()->away(config('app.frontend_url', 'http://localhost:5173').'/admin/login?verified=1');
})->middleware('signed')->name('verification.verify');
