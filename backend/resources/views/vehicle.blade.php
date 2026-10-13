@php
    $siteUrl = rtrim((string) config('app.url'), '/');
    $title = $vehicle->name ?: "{$vehicle->brand} {$vehicle->model}";
    $makeModel = "{$vehicle->brand} {$vehicle->model}";
    $canonicalUrl = "{$siteUrl}/vehicles/{$vehicle->id}";
    $gallery = $vehicle->images->filter(fn ($image) => $image->image_type);
    $heroImage = $gallery->firstWhere('image_type', 'thumbnail') ?: $gallery->first();
    $imageLabels = [
        'thumbnail' => 'Thumbnail',
        'front' => 'Front',
        'back' => 'Back',
        'left' => 'Left',
        'right' => 'Right',
        'interior_back' => 'Interior back',
        'interior_front' => 'Interior front',
        'trunk' => 'Trunk',
    ];
    $imageUrl = fn ($image) => $image?->url;
    $description = "Rent the {$makeModel}".($vehicle->name ? " ({$vehicle->name})" : '')." from CL CarHub. View photos, specifications, daily rate, and request this vehicle for your next trip.";
    $structuredData = [
        '@context' => 'https://schema.org',
        '@type' => 'Product',
        'name' => $title,
        'description' => $vehicle->description ?: $description,
        'image' => $gallery->map(fn ($image) => $imageUrl($image))->values()->all(),
        'brand' => ['@type' => 'Brand', 'name' => $vehicle->brand],
        'offers' => [
            '@type' => 'Offer',
            'priceCurrency' => 'PHP',
            'price' => (float) $vehicle->daily_rate,
            'availability' => 'https://schema.org/InStock',
            'url' => $canonicalUrl,
        ],
    ];
@endphp
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $makeModel }} Rental in the Philippines | CL CarHub</title>
    <meta name="description" content="{{ $description }}">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="{{ $canonicalUrl }}">
    <meta property="og:title" content="{{ $makeModel }} Rental in the Philippines | CL CarHub">
    <meta property="og:description" content="{{ $description }}">
    <meta property="og:type" content="product">
    <meta property="og:url" content="{{ $canonicalUrl }}">
    @if ($heroImage)
        <meta property="og:image" content="{{ $imageUrl($heroImage) }}">
    @endif
    <script type="application/ld+json">{!! json_encode($structuredData, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) !!}</script>
    <style>
        :root { color-scheme: dark; font-family: Arial, sans-serif; background: #0b0b0b; color: #f4f3f0; }
        * { box-sizing: border-box; }
        body { margin: 0; background: #0b0b0b; }
        a { color: inherit; text-decoration: none; }
        .shell { width: min(1160px, calc(100% - 36px)); margin: 0 auto; }
        header { border-bottom: 1px solid #ffffff14; }
        nav { height: 84px; display: flex; align-items: center; justify-content: space-between; }
        .logo { width: 128px; height: 80px; object-fit: contain; object-position: left; }
        .nav-links { display: flex; align-items: center; gap: 20px; font-size: 14px; color: #bbb; }
        .nav-links a:hover, .back:hover { color: #ff641f; }
        .button { display: inline-block; background: #ff641f; padding: 13px 20px; font-weight: 700; color: white; }
        main { padding: 48px 0 80px; }
        .back { color: #ff641f; font-size: 14px; }
        .hero { display: grid; grid-template-columns: 1.15fr .85fr; gap: 40px; margin-top: 32px; }
        .hero-image { min-height: 500px; display: flex; align-items: center; justify-content: center; background: #191919; }
        .hero-image img { width: 100%; max-height: 500px; object-fit: contain; }
        .thumbs { display: grid; grid-template-columns: repeat(8, 1fr); gap: 8px; margin-top: 12px; }
        .thumbs img { width: 100%; height: 64px; object-fit: cover; background: #191919; }
        .eyebrow { color: #ff641f; font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; }
        h1, h2, h3 { font-family: Arial, sans-serif; }
        h1 { margin: 12px 0 0; font-size: clamp(36px, 5vw, 56px); line-height: 1.05; }
        .muted { color: #888; }
        .price { margin-top: 32px; font-size: 36px; font-weight: 700; }
        .price small { color: #888; font-size: 14px; font-weight: 400; }
        .details { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px 16px; margin-top: 32px; padding: 24px 0; border-top: 1px solid #ffffff1a; border-bottom: 1px solid #ffffff1a; }
        .details dt { color: #777; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; }
        .details dd { margin: 5px 0 0; text-transform: capitalize; }
        .description { margin-top: 28px; color: #aaa; line-height: 1.8; }
        .related { margin-top: 80px; padding-top: 48px; border-top: 1px solid #ffffff1a; }
        .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 28px; }
        .card { border: 1px solid #ffffff12; background: #151515; }
        .card:hover { border-color: #ff641f; transform: translateY(-3px); }
        .card img, .placeholder { width: 100%; height: 208px; object-fit: cover; background: #191919; }
        .placeholder { display: flex; align-items: center; justify-content: center; color: #777; font-size: 13px; }
        .card-body { padding: 20px; }
        .card h3 { margin: 8px 0 0; font-size: 20px; }
        .card .price { margin-top: 16px; font-size: 18px; }
        .card .link { display: block; margin-top: 16px; color: #ff641f; font-size: 12px; font-weight: 700; }
        @media (max-width: 760px) {
            .nav-links { gap: 10px; font-size: 12px; }
            .nav-links .auth { display: none; }
            main { padding-top: 32px; }
            .hero { grid-template-columns: 1fr; gap: 28px; }
            .hero-image { min-height: 300px; }
            .thumbs { grid-template-columns: repeat(4, 1fr); }
            .cards { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
<header>
    <nav class="shell">
        <a href="/" aria-label="CLCarHub home"><img class="logo" src="/clcarhublogo_upscaled.png" alt="CLCarHub"></a>
        <div class="nav-links">
            <a href="/vehicles">Our fleet</a>
            <a href="/#how-it-works">How it works</a>
            <a class="auth" href="/admin/login">Sign in ↗</a>
        </div>
    </nav>
</header>
<main class="shell">
    <a class="back" href="/vehicles">← Back to our fleet</a>
    <div class="hero">
        <section>
            <div class="hero-image">
                @if ($heroImage)
                    <img src="{{ $imageUrl($heroImage) }}" alt="{{ $imageLabels[$heroImage->image_type] ?? $title }}">
                @else
                    <span class="muted">No gallery image</span>
                @endif
            </div>
            @if ($gallery->isNotEmpty())
                <div class="thumbs">
                    @foreach ($gallery as $image)
                        <a href="{{ $imageUrl($image) }}" aria-label="View {{ $imageLabels[$image->image_type] ?? 'vehicle' }} image">
                            <img src="{{ $imageUrl($image) }}" alt="{{ $imageLabels[$image->image_type] ?? 'Vehicle gallery image' }}">
                        </a>
                    @endforeach
                </div>
            @endif
        </section>
        <section>
            <p class="eyebrow">{{ \Illuminate\Support\Str::headline($vehicle->type) }} · {{ $vehicle->transmission }}</p>
            <h1>{{ $makeModel }}</h1>
            @if ($vehicle->name)
                <p class="muted">{{ $vehicle->name }} · {{ $vehicle->year }}</p>
            @else
                <p class="muted">{{ $vehicle->year }}</p>
            @endif
            <p class="price">₱{{ number_format((float) $vehicle->daily_rate) }}<small> / day</small></p>
            <dl class="details">
                <div><dt>Overall mileage limit</dt><dd>{{ $vehicle->mileage_limit === null ? 'No limit listed' : number_format($vehicle->mileage_limit).' km total' }}</dd></div>
                <div><dt>Fuel type</dt><dd>{{ \Illuminate\Support\Str::headline((string) $vehicle->fuel_type) }}</dd></div>
                <div><dt>Color</dt><dd>{{ $vehicle->color ?: '—' }}</dd></div>
                <div><dt>Seats</dt><dd>{{ $vehicle->seats ?: '—' }}</dd></div>
            </dl>
            @if ($vehicle->description)
                <p class="description">{{ $vehicle->description }}</p>
            @endif
            <a class="button" href="/admin/login?register=1&amp;vehicle_id={{ $vehicle->id }}">Rent this vehicle →</a>
        </section>
    </div>
    @if ($otherVehicles->isNotEmpty())
        <section class="related">
            <p class="eyebrow">Explore more</p>
            <h2>Other vehicles in our fleet</h2>
            <div class="cards">
                @foreach ($otherVehicles as $other)
                    @php
                        $otherTitle = $other->name ?: "{$other->brand} {$other->model}";
                        $otherImage = $other->images->firstWhere('image_type', 'thumbnail');
                    @endphp
                    <a class="card" href="/vehicles/{{ $other->id }}">
                        @if ($otherImage)
                            <img src="{{ $otherImage->url }}" alt="{{ $otherTitle }}">
                        @else
                            <div class="placeholder">No image available</div>
                        @endif
                        <div class="card-body">
                            <p class="eyebrow">{{ \Illuminate\Support\Str::headline($other->type) }} · {{ $other->transmission }}</p>
                            <h3>{{ $otherTitle }}</h3>
                            <p class="price">₱{{ number_format((float) $other->daily_rate) }}<small> / day</small></p>
                            <span class="link">View details →</span>
                        </div>
                    </a>
                @endforeach
            </div>
        </section>
    @endif
</main>
</body>
</html>
