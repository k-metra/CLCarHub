<?php

use App\Models\User;
use App\Models\Vehicle;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\OAuthController;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/sitemap.xml', function () {
    $siteUrl = rtrim((string) config('app.url'), '/');
    $urls = [
        ['loc' => "{$siteUrl}/", 'lastmod' => null],
        ['loc' => "{$siteUrl}/vehicles", 'lastmod' => null],
        ['loc' => "{$siteUrl}/terms", 'lastmod' => null],
        ['loc' => "{$siteUrl}/privacy", 'lastmod' => null],
    ];

    Vehicle::query()
        ->where('status', 'available')
        ->orderBy('id')
        ->get(['id', 'updated_at'])
        ->each(function (Vehicle $vehicle) use (&$urls): void {
            $urls[] = [
                'loc' => "{$siteUrl}/vehicles/{$vehicle->id}",
                'lastmod' => $vehicle->updated_at?->toDateString(),
            ];
        });

    $xml = '<?xml version="1.0" encoding="UTF-8"?>'
        . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';

    foreach ($urls as $url) {
        $xml .= '<url><loc>'.htmlspecialchars($url['loc'], ENT_XML1, 'UTF-8').'</loc>';
        if ($url['lastmod']) {
            $xml .= '<lastmod>'.$url['lastmod'].'</lastmod>';
        }
        $xml .= '</url>';
    }

    return response($xml.'</urlset>', 200, ['Content-Type' => 'application/xml; charset=UTF-8']);
})->name('sitemap');

Route::get('/api/auth/{provider}/redirect', [OAuthController::class, 'redirect']);
Route::get('/api/auth/{provider}/callback', [OAuthController::class, 'callback']);

Route::get('/email/verify/{id}/{hash}', function (Request $request, int $id, string $hash) {
    $user = User::findOrFail($id);
    abort_unless(hash_equals((string) $hash, sha1($user->getEmailForVerification())), 403);
    $user->markEmailAsVerified();

    return redirect()->away(config('app.frontend_url', 'http://localhost:5173').'/admin/login?verified=1');
})->middleware('signed')->name('verification.verify');
