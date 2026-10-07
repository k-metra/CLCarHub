<?php

namespace App\Http\Middleware;

use App\Models\IpBlock;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RejectBlockedIp
{
    public function handle(Request $request, Closure $next, string $scope = 'all'): Response
    {
        $ip = $request->ip();
        $blocked = IpBlock::query()
            ->where('ip_address', $ip)
            ->where(function ($query) use ($scope) {
                $query->where('scope', 'all')->orWhere('scope', $scope);
            })
            ->exists();

        abort_if($blocked, 403, 'Access from this IP address has been blocked.');

        return $next($request);
    }
}
