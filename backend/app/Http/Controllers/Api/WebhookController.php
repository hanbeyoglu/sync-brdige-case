<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ApplySyncMappingRequest;
use App\Http\Requests\MarkProductsSyncedRequest;
use App\Models\Product;
use App\Models\ProductInventory;
use App\Models\SyncLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class WebhookController extends Controller
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


    /**
     * Ürün güncelleme webhook - Shopify'dan Laravel'e
     */
    public function productsUpdate(Request $request): JsonResponse
    {
        $payload = $request->all();
        Log::info('Shopify products/update webhook', ['payload' => $payload]);

        // Variant SKU ve inventory güncellemelerini işle
        if (isset($payload['variants'])) {
            foreach ($payload['variants'] as $variant) {
                $sku = $variant['sku'] ?? null;
                if ($sku) {
                    $product = Product::where('sku', $sku)->first();
                    if ($product) {
                        $product->update([
                            'shopify_variant_id' => 'gid://shopify/ProductVariant/'.($variant['id'] ?? ''),
                        ]);
                    }
                }
            }
        }

        return response()->json(['received' => true]);
    }

    /**
     * Stok güncelleme webhook - Shopify inventory_items/update
     */
    public function inventoryUpdate(Request $request): JsonResponse
    {
        $payload = $request->all();
        Log::info('Shopify inventory_items/update webhook', ['payload' => $payload]);

        // Inventory item ID ile eşleşen kaydı güncelle
        $inventoryItemId = $payload['admin_graphql_api_id'] ?? $payload['id'] ?? null;
        if ($inventoryItemId) {
            $inv = ProductInventory::where('shopify_inventory_item_id', $inventoryItemId)->first();
            if ($inv) {
                $inv->update(['quantity' => $payload['available'] ?? $inv->quantity]);
            }
        }

        return response()->json(['received' => true]);
    }

    /**
     * Stok seviyesi güncelleme webhook - Shopify inventory_levels/update
     * inventory_item_id + location_id ile ProductInventory eşleşmesi
     */
    public function inventoryLevelsUpdate(Request $request): JsonResponse
    {
        $payload = $request->all();
        Log::info('Shopify inventory_levels/update webhook', ['payload' => $payload]);

        $inventoryItemId = $this->normalizeShopifyGid($payload['inventory_item_id'] ?? null, 'InventoryItem');
        $locationId = $this->normalizeShopifyGid($payload['location_id'] ?? null, 'Location');
        $quantity = isset($payload['available']) ? (int) $payload['available'] : null;

        if (!$inventoryItemId || !$locationId || $quantity === null) {
            return response()->json(['received' => true]);
        }

        $inv = ProductInventory::where('shopify_inventory_item_id', $inventoryItemId)
            ->where('shopify_location_id', $locationId)
            ->first();

        if ($inv) {
            $inv->update(['quantity' => $quantity]);
        }

        return response()->json(['received' => true]);
    }

    /**
     * REST numeric ID veya GID formatını Laravel'deki GID formatına çevir
     */
    private function normalizeShopifyGid($value, string $resource): ?string
    {
        if (empty($value)) {
            return null;
        }
        if (is_string($value) && str_starts_with($value, 'gid://')) {
            return $value;
        }
        $id = is_numeric($value) ? $value : (string) preg_replace('/\D/', '', $value);
        return $id !== '' ? "gid://shopify/{$resource}/{$id}" : null;
    }

    /**
     * Sipariş oluşturma webhook - stok düşümü
     */
    public function ordersCreate(Request $request): JsonResponse
    {
        $payload = $request->all();
        // #region agent log
        $this->debugLog('initial', 'H4', 'WebhookController.php:135', 'ordersCreate entered', [
            'orderId' => $payload['id'] ?? null,
            'lineItemsCount' => isset($payload['line_items']) && is_array($payload['line_items']) ? count($payload['line_items']) : 0,
            'financialStatus' => $payload['financial_status'] ?? null,
            'sourceName' => $payload['source_name'] ?? null,
            'createdVia' => $payload['created_via'] ?? null,
        ]);
        // #endregion
        Log::info('Shopify orders/create webhook', ['order_id' => $payload['id'] ?? null]);

        if (isset($payload['line_items'])) {
            foreach ($payload['line_items'] as $item) {
                $sku = $item['sku'] ?? null;
                $qty = (int) ($item['quantity'] ?? 0);
                if ($sku && $qty > 0) {
                    $product = Product::where('sku', $sku)->first();
                    if ($product) {
                        $inv = $product->inventory()->first();
                        if ($inv) {
                            $inv->decrement('quantity', $qty);
                            // #region agent log
                            $this->debugLog('initial', 'H5', 'WebhookController.php:153', 'inventory decremented', [
                                'sku' => $sku,
                                'qty' => $qty,
                                'inventoryId' => $inv->id,
                            ]);
                            // #endregion
                        } else {
                            // #region agent log
                            $this->debugLog('initial', 'H5', 'WebhookController.php:161', 'inventory row missing for sku', [
                                'sku' => $sku,
                            ]);
                            // #endregion
                        }
                    } else {
                        // #region agent log
                        $this->debugLog('initial', 'H5', 'WebhookController.php:168', 'product not found by sku', [
                            'sku' => $sku,
                        ]);
                        // #endregion
                    }
                } else {
                    // #region agent log
                    $this->debugLog('initial', 'H4', 'WebhookController.php:175', 'line item skipped due to missing sku/qty', [
                        'hasSku' => !empty($sku),
                        'qty' => $qty,
                    ]);
                    // #endregion
                }
            }
        }

        return response()->json(['received' => true]);
    }

    /**
     * Manuel senkronizasyon tetikleme - Shopify App'ten çağrılır
     */
    public function triggerSync(Request $request): JsonResponse
    {
        $shopDomain = $request->input('shop_domain');
        $syncType = $request->input('sync_type', 'manual');

        $log = SyncLog::create([
            'shop_domain' => $shopDomain,
            'sync_type' => $syncType,
            'status' => SyncLog::STATUS_PENDING,
            'started_at' => now(),
        ]);

        // Queue'ya job gönder (veya senkron işle)
        dispatch(function () use ($log) {
            // Sync job - Shopify App tarafında asıl işlem yapılacak
            // Bu endpoint sadece log oluşturur ve App'e "sync başlat" sinyali verir
            $log->update(['status' => SyncLog::STATUS_RUNNING]);
        })->afterResponse();

        return response()->json([
            'success' => true,
            'sync_log_id' => $log->id,
            'message' => 'Senkronizasyon başlatıldı',
        ]);
    }

    /**
     * Sync sonrası Shopify mapping bilgilerini Laravel'e geri yaz
     * Shopify App bulk sync tamamlandığında bu endpoint'e mapping array gönderir
     */
    public function applyMapping(ApplySyncMappingRequest $request): JsonResponse
    {
        $started = microtime(true);
        $mappings = $request->validated();
        $updated = 0;

        foreach ($mappings as $mapping) {
            $product = Product::where('sku', $mapping['sku'])->first();
            if (!$product) {
                continue;
            }

            if (! empty($mapping['archived_from_sync'])) {
                $product->update([
                    'shopify_product_id' => null,
                    'shopify_variant_id' => null,
                    'in_shopify' => false,
                ]);
                $inv = $product->inventory()->first();
                if ($inv) {
                    $inv->update([
                        'shopify_inventory_item_id' => null,
                        'shopify_location_id' => null,
                    ]);
                }
                $updated++;

                continue;
            }

            $productData = array_filter([
                'shopify_product_id' => $mapping['shopify_product_id'] ?? null,
                'shopify_variant_id' => $mapping['shopify_variant_id'] ?? null,
                'in_shopify' => !empty($mapping['shopify_product_id']),
            ], fn ($v) => $v !== null);

            if (!empty($productData)) {
                $product->update($productData);
            }

            if (!empty($mapping['shopify_inventory_item_id']) || !empty($mapping['shopify_location_id'])) {
                $inv = $product->inventory()->first();
                if ($inv) {
                    $invData = array_filter([
                        'shopify_inventory_item_id' => $mapping['shopify_inventory_item_id'] ?? null,
                        'shopify_location_id' => $mapping['shopify_location_id'] ?? null,
                    ], fn ($v) => $v !== null);
                    if (!empty($invData)) {
                        $inv->update($invData);
                    }
                } else {
                    ProductInventory::create([
                        'product_id' => $product->id,
                        'quantity' => 0,
                        'location' => 'default',
                        'shopify_inventory_item_id' => $mapping['shopify_inventory_item_id'] ?? null,
                        'shopify_location_id' => $mapping['shopify_location_id'] ?? null,
                    ]);
                }
            }

            $updated++;
        }

        Log::info('Sync mapping applied', [
            'items' => count($mappings),
            'updated' => $updated,
            'duration_ms' => round((microtime(true) - $started) * 1000, 2),
            'note' => 'Yalnızca Laravel ürün/envanter eşlemesi; tier metafield yazımı shopify-app bulkSync (Admin GraphQL metafieldsSet) içindedir.',
        ]);

        return response()->json([
            'success' => true,
            'message' => "{$updated} ürün mapping bilgisi güncellendi",
            'updated' => $updated,
        ]);
    }

    /**
     * Başarılı senkron sonrası ürünleri "kirli değil" olarak işaretle (hash + zaman).
     */
    public function markProductsSynced(MarkProductsSyncedRequest $request): JsonResponse
    {
        $skus = $request->validated()['skus'];
        $marked = 0;

        foreach ($skus as $sku) {
            $product = Product::with('priceTiers')->where('sku', $sku)->first();
            if (! $product) {
                continue;
            }

            $hash = $product->computeSyncHash();
            $product->update([
                'last_synced_at' => now(),
                'last_synced_hash' => $hash,
            ]);
            $marked++;
        }

        Log::info('SyncBridge mark-synced', ['requested' => count($skus), 'marked' => $marked]);

        return response()->json([
            'success' => true,
            'marked' => $marked,
        ]);
    }

    /**
     * Senkronizasyon logunu güncelle (Shopify App'ten tamamlandığında çağrılır)
     */
    public function updateSyncLog(Request $request, int $id): JsonResponse
    {
        $log = SyncLog::find($id);
        if (!$log) {
            return response()->json(['error' => 'Log bulunamadı'], 404);
        }

        $metadata = $request->has('metadata') ? $request->input('metadata') : null;

        $log->update(array_filter([
            'status' => $request->input('status', SyncLog::STATUS_COMPLETED),
            'message' => $request->input('message'),
            'items_processed' => $request->input('items_processed', 0),
            'items_failed' => $request->input('items_failed', 0),
            'metadata' => $metadata,
            'completed_at' => now(),
        ], fn ($v) => $v !== null));

        if (is_array($metadata)) {
            $mfFailed = (int) ($metadata['metafields']['failed'] ?? 0);
            $errors = $metadata['errors'] ?? [];
            $metafieldErrors = array_values(array_filter(
                is_array($errors) ? $errors : [],
                fn ($e) => is_array($e) && ($e['step'] ?? '') === 'metafield'
            ));
            if ($mfFailed > 0 || $metafieldErrors !== []) {
                Log::warning('SyncBridge Shopify metafieldsSet (App → log metadata)', [
                    'sync_log_id' => $id,
                    'metafields_failed' => $mfFailed,
                    'metafield_errors' => $metafieldErrors,
                ]);
            }
        }

        return response()->json(['success' => true]);
    }
}
