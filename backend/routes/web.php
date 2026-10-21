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
        ['loc' => "{$siteUrl}/host-partnership", 'lastmod' => null],
        ['loc' => "{$siteUrl}/terms", 'lastmod' => null],
        ['loc' => "{$siteUrl}/privacy", 'lastmod' => null],
    ];

    Vehicle::query()
        ->where('status', 'available')
        ->orderBy('id')
        ->with('images')
        ->get(['id', 'updated_at'])
        ->each(function (Vehicle $vehicle) use (&$urls, $siteUrl): void {
            $urls[] = [
                'loc' => "{$siteUrl}/vehicles/{$vehicle->id}",
                'lastmod' => $vehicle->updated_at?->toDateString(),
                'images' => $vehicle->images
                    ->filter(fn ($image) => $image->image_type)
                    ->map(fn ($image) => $image->url)
                    ->values()
                    ->all(),
            ];
        });

    $xml = '<?xml version="1.0" encoding="UTF-8"?>'
        . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">';

    foreach ($urls as $url) {
        $xml .= '<url><loc>'.htmlspecialchars($url['loc'], ENT_XML1, 'UTF-8').'</loc>';
        if ($url['lastmod']) {
            $xml .= '<lastmod>'.$url['lastmod'].'</lastmod>';
        }
        foreach ($url['images'] ?? [] as $image) {
            $xml .= '<image:image><image:loc>'.htmlspecialchars($image, ENT_XML1, 'UTF-8').'</image:loc></image:image>';
        }
        $xml .= '</url>';
    }

    return response($xml.'</urlset>', 200, ['Content-Type' => 'application/xml; charset=UTF-8']);
})->name('sitemap');

Route::get('/host-partnership', function () {
    return view('host-partnership');
})->name('host-partnership');

Route::get('/vehicles/{vehicle}', function (Vehicle $vehicle) {
    abort_unless($vehicle->status === 'available', 404);

    $vehicle->load('images');
    $otherVehicles = Vehicle::query()
        ->with('images')
        ->where('status', 'available')
        ->whereKeyNot($vehicle->id)
        ->latest()
        ->get();

    return view('vehicle', compact('vehicle', 'otherVehicles'));
})->name('vehicles.show');

Route::get('/api/auth/{provider}/redirect', [OAuthController::class, 'redirect']);
Route::get('/api/auth/{provider}/callback', [OAuthController::class, 'callback']);

Route::get('/email/verify/{id}/{hash}', function (Request $request, int $id, string $hash) {
    $user = User::findOrFail($id);
    abort_unless(hash_equals((string) $hash, sha1($user->getEmailForVerification())), 403);
    $user->markEmailAsVerified();

    return redirect()->away(config('app.frontend_url', 'http://localhost:5173').'/admin/login?verified=1');
})->middleware('signed')->name('verification.verify');
