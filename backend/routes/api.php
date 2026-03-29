<?php

use App\Http\Controllers\Api\ProductApiController;
use App\Http\Controllers\Api\WebhookController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes - Shopify App ve harici entegrasyonlar için
|--------------------------------------------------------------------------
*/

// API Secret ile korunan rotalar (Shopify App'ten çağrılır)
Route::middleware(['api', \App\Http\Middleware\VerifyApiSecret::class])->group(function () {
    Route::get('/products', [ProductApiController::class, 'index']);
    Route::get('/products/{sku}', [ProductApiController::class, 'show']);
    Route::post('/sync/trigger', [WebhookController::class, 'triggerSync']);
    Route::post('/sync/apply-mapping', [WebhookController::class, 'applyMapping']);
    Route::post('/sync/mark-synced', [WebhookController::class, 'markProductsSynced']);
    Route::patch('/sync/logs/{id}', [WebhookController::class, 'updateSyncLog']);
    Route::get('/sync/logs', [ProductApiController::class, 'syncLogs']);
});

// Webhook rotaları — HMAC Shopify app (Node) katmanında; burada x-internal-secret ile güvenilir
Route::prefix('webhooks/shopify')->group(function () {
    Route::post('/products/update', [WebhookController::class, 'productsUpdate']);
    Route::post('/inventory/update', [WebhookController::class, 'inventoryUpdate']);
    Route::post('/inventory-levels/update', [WebhookController::class, 'inventoryLevelsUpdate']);
    Route::post('/orders/create', [WebhookController::class, 'ordersCreate']);
});
