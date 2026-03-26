<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

class VerifyShopifyWebhook
{
    private function debugLog(string $runId, string $hypothesisId, string $location, string $message, array $data = []): void
    {
        try {
            file_put_contents(
                '/Users/hanbeyoglu/Desktop/Apps/SyncBridge/.cursor/debug.log',
                json_encode([
                    'id' => uniqid('log_', true),
                    'timestamp' => (int) round(microtime(true) * 1000),
                    'runId' => $runId,
                    'hypothesisId' => $hypothesisId,
                    'location' => $location,
                    'message' => $message,
                    'data' => $data,
                ], JSON_UNESCAPED_SLASHES) . PHP_EOL,
                FILE_APPEND
            );
        } catch (\Throwable $e) {
            // no-op
        }
    }

    public function handle(Request $request, Closure $next): Response
    {
        $hmacHeader = $request->header('X-Shopify-Hmac-Sha256');
        $secret = config('shopify.webhook_secret');
        // #region agent log
        $this->debugLog('initial', 'H3', 'VerifyShopifyWebhook.php:40', 'middleware entered', [
            'path' => $request->path(),
            'hasHmacHeader' => !empty($hmacHeader),
            'secretConfigured' => !empty($secret),
            'secretPlaceholder' => $secret === 'your_webhook_secret',
        ]);
        // #endregion

        if (empty($hmacHeader) || empty($secret)) {
            Log::warning('Shopify webhook: HMAC header veya secret eksik');
            // #region agent log
            $this->debugLog('initial', 'H3', 'VerifyShopifyWebhook.php:50', 'middleware rejected missing hmac or secret', [
                'hasHmacHeader' => !empty($hmacHeader),
                'secretConfigured' => !empty($secret),
            ]);
            // #endregion
            return response('Unauthorized', 401);
        }

        $payload = $request->getContent();
        $calculatedHmac = base64_encode(hash_hmac('sha256', $payload, $secret, true));

        if (!hash_equals($calculatedHmac, $hmacHeader)) {
            Log::warning('Shopify webhook: HMAC doğrulaması başarısız');
            // #region agent log
            $this->debugLog('initial', 'H3', 'VerifyShopifyWebhook.php:62', 'middleware rejected hmac mismatch', [
                'path' => $request->path(),
                'secretPlaceholder' => $secret === 'your_webhook_secret',
            ]);
            // #endregion
            return response('Unauthorized', 401);
        }

        // #region agent log
        $this->debugLog('initial', 'H3', 'VerifyShopifyWebhook.php:70', 'middleware passed hmac validation', [
            'path' => $request->path(),
        ]);
        // #endregion
        return $next($request);
    }
}
