<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use App\Http\Middleware\NoStoreApiResponses;
use Symfony\Component\HttpKernel\Exception\RequestEntityTooLargeHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->appendToGroup('api', [NoStoreApiResponses::class]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->render(function (RequestEntityTooLargeHttpException $exception, Request $request) {
            if ($request->is('api/*') || $request->expectsJson()) {
                return response()->json([
                    'message' => 'One or more uploaded files are too large. Please choose files smaller than 20 MB each and try again.',
                ], 413);
            }
        });
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
