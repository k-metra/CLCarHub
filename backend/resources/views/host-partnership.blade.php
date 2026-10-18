@php
    $siteUrl = rtrim((string) config('app.url'), '/');
    $canonicalUrl = "{$siteUrl}/host-partnership";
    $title = 'Host Partnership Program | CL CarHub';
    $description = 'Have a vehicle? Partner with CL CarHub and earn extra income by registering your car in our rental business.';
    $structuredData = [
        '@context' => 'https://schema.org',
        '@type' => 'Offer',
        'name' => 'CL CarHub Host Partnership Program',
        'description' => 'A vehicle partnership program for owners who want to earn extra income through car rentals.',
        'url' => $canonicalUrl,
        'seller' => ['@type' => 'Organization', 'name' => 'CL CarHub'],
    ];
@endphp
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $title }}</title>
    <meta name="description" content="{{ $description }}">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="{{ $canonicalUrl }}">
    <meta property="og:title" content="{{ $title }}">
    <meta property="og:description" content="{{ $description }}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="{{ $canonicalUrl }}">
    <meta property="og:image" content="{{ $siteUrl }}/hostpartnershipprogram.jpg">
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
        .back { color: #aaa; font-size: 14px; }
        .back:hover, .link:hover { color: #ff641f; }
        main { overflow: hidden; }
        .hero { position: relative; display: grid; grid-template-columns: .9fr 1.1fr; align-items: center; gap: 80px; padding: 80px 0; }
        .glow { pointer-events: none; position: absolute; left: 50%; top: 0; width: 720px; height: 560px; transform: translateX(-50%); border-radius: 999px; background: #ff641f1a; filter: blur(130px); }
        .hero-copy, .hero-art { position: relative; }
        .eyebrow, .ready { color: #ff6a23; font-size: 10px; font-weight: 700; letter-spacing: 2.8px; text-transform: uppercase; }
        h1, h2 { font-family: Arial, sans-serif; }
        h1 { margin: 20px 0 0; font-size: clamp(48px, 7vw, 72px); line-height: .95; letter-spacing: -4px; }
        em { color: #ff641f; font-style: normal; }
        .lead { max-width: 520px; margin: 28px 0 0; color: #aaa6a1; font-size: 18px; line-height: 1.75; }
        .actions { display: flex; align-items: center; gap: 16px; margin-top: 36px; }
        .button { display: inline-flex; align-items: center; gap: 12px; background: #ff641f; padding: 16px 24px; font-size: 14px; font-weight: 700; box-shadow: 0 12px 32px #ff641f3d; }
        .hint { color: #777; font-size: 12px; }
        .art-frame { position: relative; overflow: hidden; border: 1px solid #ff641f59; background: #151515; padding: 8px; box-shadow: 0 25px 70px #0009; }
        .art-frame::before { content: ''; position: absolute; inset: -16px; z-index: -1; border-radius: 2rem; background: #ff641f33; filter: blur(24px); }
        .art-frame img { display: block; width: 100%; height: auto; }
        .benefits { border-top: 1px solid #ffffff0f; border-bottom: 1px solid #ffffff0f; background: #151515; }
        .benefit-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: #ffffff14; }
        .benefit { background: #151515; padding: 36px; }
        .number { color: #ff641f; font-size: 14px; font-weight: 700; }
        .benefit h2 { margin: 28px 0 0; font-size: 20px; }
        .benefit p, .closing p { color: #85827e; font-size: 14px; line-height: 1.7; }
        .closing { max-width: 760px; margin: 0 auto; padding: 96px 0; text-align: center; }
        .closing h2 { margin: 16px 0 0; font-size: clamp(40px, 6vw, 56px); line-height: 1; letter-spacing: -2px; }
        .outline { display: inline-flex; margin-top: 32px; border: 1px solid #ff641f; padding: 16px 24px; color: #ff8a55; font-size: 14px; font-weight: 700; }
        .outline:hover { background: #ff641f; color: white; }
        footer { border-top: 1px solid #ffffff0f; padding: 28px 0; color: #777; font-size: 12px; }
        @media (max-width: 760px) {
            nav { height: 76px; }
            .logo { width: 112px; height: 64px; }
            .hero { grid-template-columns: 1fr; gap: 48px; padding: 48px 0; }
            .hero-copy { order: 2; }
            .hero-art { order: 1; }
            h1 { font-size: 48px; }
            .lead { font-size: 16px; }
            .actions, .benefit-grid { display: block; }
            .hint { display: inline-block; margin-top: 16px; }
            .benefit { padding: 28px; }
            .closing { padding: 64px 0; }
        }
    </style>
</head>
<body>
<header>
    <nav class="shell">
        <a href="/" aria-label="CL CarHub home"><img class="logo" src="/clcarhublogo_upscaled.png" alt="CL CarHub"></a>
        <a class="back" href="/">Back to home</a>
    </nav>
</header>
<main>
    <section class="shell hero">
        <div class="glow"></div>
        <div class="hero-copy">
            <p class="eyebrow">CL CARHUB HOST PARTNERSHIP</p>
            <h1>May sasakyan ka?<br><em>Pagkakitaan natin 'yan!</em></h1>
            <p class="lead">Your vehicle can do more than sit in the garage. Partner with CL CarHub and register your car in our rental business to earn extra income with a team that helps take care of the details.</p>
            <div class="actions">
                <a class="button" href="https://facebook.com/clcarhub" target="_blank" rel="noreferrer">Inquire on Facebook <span aria-hidden="true">↗</span></a>
                <span class="hint">Message us for program details</span>
            </div>
        </div>
        <div class="hero-art">
            <div class="art-frame"><img src="/hostpartnershipprogram.jpg" alt="CL CarHub Host Partnership Program: earn extra income with your vehicle"></div>
        </div>
    </section>
    <section class="benefits">
        <div class="shell benefit-grid">
            <div class="benefit"><span class="number">01</span><h2>Extra income</h2><p>Make your vehicle work for you when it is available.</p></div>
            <div class="benefit"><span class="number">02</span><h2>Flexible partnership</h2><p>Explore an arrangement that fits your vehicle and schedule.</p></div>
            <div class="benefit"><span class="number">03</span><h2>A growing team</h2><p>Connect with CL CarHub and our rental community.</p></div>
        </div>
    </section>
    <section class="shell closing">
        <p class="ready">READY TO GET STARTED?</p>
        <h2>Let's talk about<br><em>your vehicle.</em></h2>
        <p>Send CL CarHub a message on Facebook to learn about the requirements and next steps for becoming a host.</p>
        <a class="outline" href="https://facebook.com/clcarhub" target="_blank" rel="noreferrer">Message CL CarHub <span aria-hidden="true">↗</span></a>
    </section>
</main>
<footer><div class="shell">© {{ date('Y') }} CL CarHub. All rights reserved.</div></footer>
</body>
</html>
