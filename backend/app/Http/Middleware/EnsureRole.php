<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureRole
{
    /**
     * Handle an incoming request.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        abort_unless($request->user() && in_array($request->user()->role, $roles, true), 403, 'You do not have permission to perform this action.');
        if ($request->user()->role === 'host') {
            abort_unless($request->user()->partner?->host_access_status === 'active', 403, 'Host Dashboard access is not active.');
        }

        return $next($request);
    }
}
