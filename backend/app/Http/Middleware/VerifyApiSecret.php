<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class VerifyApiSecret
{
    public function handle(Request $request, Closure $next): Response
    {
        $apiSecret = config('shopify.api_secret_for_app');
        $providedSecret = $request->header('X-API-Secret') ?? $request->query('api_secret');

        if (empty($apiSecret) || $providedSecret !== $apiSecret) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        return $next($request);
    }
}
