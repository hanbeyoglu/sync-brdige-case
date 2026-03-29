<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ApplySyncMappingRequest;
use App\Http\Requests\MarkProductsSyncedRequest;
use App\Models\Product;
use App\Models\ProductInventory;
use App\Models\ShopifyWebhookLog;
use App\Models\SyncLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class WebhookController extends Controller
{
    /**
     * Node (Shopify app) tarafından iletilen webhook'lar için paylaşılan gizli anahtar doğrulaması.
     */
    private function rejectUnlessTrustedInternalWebhook(Request $request): ?JsonResponse
    {
        $header = trim((string) ($request->header('x-internal-secret') ?? ''));
        $configRaw = config('shopify.internal_secret');
        $config = is_string($configRaw) ? trim($configRaw) : '';

        if ($header === '' || $config === '' || ! hash_equals($config, $header)) {
            if (config('app.debug')) {
                Log::info('SECRET DEBUG', [
                    'path' => $request->path(),
                    'header_len' => strlen($header),
                    'config_len' => strlen($config),
                    'env_call_in_controller_is_null' => env('INTERNAL_SECRET') === null,
                ]);
            }

            Log::warning('Unauthorized webhook', [
                'path' => $request->path(),
                'header_len' => strlen($header),
                'config_len' => strlen($config),
            ]);

            return response()->json(['error' => 'Unauthorized'], 401);
        }

        return null;
    }

    /**
     * Ürün güncelleme webhook - Shopify'dan Laravel'e
     */
    public function productsUpdate(Request $request): JsonResponse
    {
        if ($unauthorized = $this->rejectUnlessTrustedInternalWebhook($request)) {
            return $unauthorized;
        }

        $payload = $request->all();
        Log::info('SyncBridge webhook products/update işleniyor', [
            'product_id' => $payload['id'] ?? null,
            'payload_keys' => array_keys($payload),
        ]);

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
        if ($unauthorized = $this->rejectUnlessTrustedInternalWebhook($request)) {
            return $unauthorized;
        }

        $payload = $request->all();
        Log::info('SyncBridge webhook inventory_items/update işleniyor', [
            'inventory_item_id' => $payload['admin_graphql_api_id'] ?? $payload['id'] ?? null,
        ]);

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
        if ($unauthorized = $this->rejectUnlessTrustedInternalWebhook($request)) {
            return $unauthorized;
        }

        $payload = $request->all();
        Log::info('SyncBridge webhook inventory_levels/update işleniyor', [
            'inventory_item_id' => $payload['inventory_item_id'] ?? null,
            'location_id' => $payload['location_id'] ?? null,
            'available' => $payload['available'] ?? null,
        ]);

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
     * Sipariş satırlarından variant GID başına toplam düşülecek miktarları üretir (aynı variant tekrarları birleşir).
     *
     * @return array<string, int> shopify_variant_id (GID) => quantity
     */
    private function aggregateOrderDeductionsByVariantGid(array $lineItems, mixed $orderId): array
    {
        $deductions = [];

        foreach ($lineItems as $index => $item) {
            $variantRaw = $item['variant_id'] ?? null;
            $variantGid = $this->normalizeShopifyGid($variantRaw, 'ProductVariant');
            $quantity = (int) ($item['quantity'] ?? 0);

            Log::info('SyncBridge orders/create satır inceleniyor', [
                'order_id' => $orderId,
                'line_index' => $index,
                'variant_id_raw' => $variantRaw,
                'shopify_variant_id' => $variantGid,
                'quantity' => $quantity,
            ]);

            if ($quantity <= 0) {
                Log::notice('SyncBridge orders/create satır atlandı (geçersiz miktar)', [
                    'order_id' => $orderId,
                    'line_index' => $index,
                    'quantity' => $quantity,
                ]);

                continue;
            }

            if (! $variantGid) {
                Log::notice('SyncBridge orders/create satır atlandı (variant_id yok veya çözülemedi)', [
                    'order_id' => $orderId,
                    'line_index' => $index,
                    'variant_id_raw' => $variantRaw,
                ]);

                continue;
            }

            $deductions[$variantGid] = ($deductions[$variantGid] ?? 0) + $quantity;
        }

        return $deductions;
    }

    /**
     * Sipariş oluşturma webhook — shopify_variant_id eşlemesi ile ProductInventory üzerinden stok düşümü.
     *
     * Idempotency: shopify_order_id üzerinde benzersiz kayıt + insertOrIgnore ile aynı transaction içinde
     * atomik "claim" (yarış koşullarında çift stok düşümünü engeller). Claim, stok işleminden önce yapılır;
     * işlem başarısız olursa rollback ile claim de geri alınır.
     *
     * Not: Stok `product_inventories.quantity` alanında tutulur.
     */
    public function ordersCreate(Request $request): JsonResponse
    {
        if ($unauthorized = $this->rejectUnlessTrustedInternalWebhook($request)) {
            return $unauthorized;
        }

        $payload = $request->all();
        $orderId = $payload['id'] ?? null;
        $lineItems = $payload['line_items'] ?? [];

        Log::info('SyncBridge orders/create webhook alındı', [
            'order_id' => $orderId,
            'line_items_count' => is_array($lineItems) ? count($lineItems) : 0,
            'financial_status' => $payload['financial_status'] ?? null,
            'source_name' => $payload['source_name'] ?? null,
        ]);

        if ($orderId === null || $orderId === '') {
            Log::notice('SyncBridge orders/create order id eksik, idempotency uygulanmadı');

            return response()->json([
                'received' => true,
                'order_id' => null,
                'deductions_applied' => 0,
                'success' => false,
                'error' => 'missing_order_id',
            ], 200);
        }

        $orderIdStr = (string) $orderId;

        if (ShopifyWebhookLog::query()->where('shopify_order_id', $orderIdStr)->exists()) {
            Log::info('SyncBridge orders/create duplicate webhook yok sayıldı', [
                'order_id' => $orderIdStr,
            ]);

            return response()->json([
                'received' => true,
                'success' => true,
                'duplicate' => true,
                'order_id' => $orderIdStr,
            ]);
        }

        if (! is_array($lineItems) || $lineItems === []) {
            return response()->json([
                'received' => true,
                'order_id' => $orderIdStr,
                'deductions_applied' => 0,
            ]);
        }

        try {
            $deductionsByVariantGid = $this->aggregateOrderDeductionsByVariantGid($lineItems, $orderId);

            if ($deductionsByVariantGid === []) {
                Log::notice('SyncBridge orders/create geçerli satır yok (stok düşümü yapılmadı)', [
                    'order_id' => $orderIdStr,
                ]);

                return response()->json([
                    'received' => true,
                    'order_id' => $orderIdStr,
                    'deductions_applied' => 0,
                ]);
            }

            $variantGids = array_keys($deductionsByVariantGid);
            $productsByVariantGid = Product::query()
                ->whereIn('shopify_variant_id', $variantGids)
                ->get()
                ->keyBy('shopify_variant_id');

            $rows = [];
            foreach ($deductionsByVariantGid as $gid => $qty) {
                $product = $productsByVariantGid->get($gid);
                if (! $product) {
                    Log::warning('SyncBridge orders/create ürün bulunamadı (shopify_variant_id)', [
                        'order_id' => $orderIdStr,
                        'shopify_variant_id' => $gid,
                        'quantity_requested' => $qty,
                    ]);

                    continue;
                }
                $rows[] = ['product' => $product, 'quantity' => $qty];
            }

            usort($rows, fn (array $a, array $b): int => $a['product']->id <=> $b['product']->id);

            $deductionGroupCount = count($deductionsByVariantGid);
            $applied = 0;

            $response = DB::transaction(function () use ($rows, $orderIdStr, &$applied, $deductionGroupCount) {
                $now = now();
                $claimed = ShopifyWebhookLog::query()->insertOrIgnore([
                    'topic' => 'orders/create',
                    'shopify_order_id' => $orderIdStr,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);

                if ($claimed === 0) {
                    Log::info('SyncBridge orders/create duplicate webhook yok sayıldı (transaction içi)', [
                        'order_id' => $orderIdStr,
                    ]);

                    return response()->json([
                        'received' => true,
                        'success' => true,
                        'duplicate' => true,
                        'order_id' => $orderIdStr,
                    ]);
                }

                foreach ($rows as $row) {
                    /** @var Product $product */
                    $product = $row['product'];
                    $quantity = $row['quantity'];

                    Log::info('SyncBridge orders/create stok düşümü başlıyor', [
                        'order_id' => $orderIdStr,
                        'product_id' => $product->id,
                        'shopify_variant_id' => $product->shopify_variant_id,
                        'quantity' => $quantity,
                    ]);

                    $inv = ProductInventory::query()
                        ->where('product_id', $product->id)
                        ->lockForUpdate()
                        ->first();

                    if (! $inv) {
                        Log::notice('SyncBridge orders/create envanter kaydı yok', [
                            'order_id' => $orderIdStr,
                            'product_id' => $product->id,
                            'shopify_variant_id' => $product->shopify_variant_id,
                        ]);

                        continue;
                    }

                    $onHand = (int) $inv->quantity;
                    if ($onHand < $quantity) {
                        Log::warning('SyncBridge orders/create yetersiz stok', [
                            'order_id' => $orderIdStr,
                            'product_id' => $product->id,
                            'shopify_variant_id' => $product->shopify_variant_id,
                            'inventory_id' => $inv->id,
                            'quantity_on_hand' => $onHand,
                            'quantity_requested' => $quantity,
                        ]);

                        continue;
                    }

                    $inv->decrement('quantity', $quantity);
                    $inv->refresh();

                    $applied++;

                    Log::info('SyncBridge orders/create stok güncellendi', [
                        'order_id' => $orderIdStr,
                        'product_id' => $product->id,
                        'shopify_variant_id' => $product->shopify_variant_id,
                        'inventory_id' => $inv->id,
                        'quantity_deducted' => $quantity,
                        'quantity_remaining' => (int) $inv->quantity,
                    ]);
                }

                Log::info('SyncBridge orders/create webhook başarıyla işlendi', [
                    'order_id' => $orderIdStr,
                    'deduction_groups' => $deductionGroupCount,
                    'deductions_applied' => $applied,
                ]);

                return response()->json([
                    'received' => true,
                    'order_id' => $orderIdStr,
                    'deductions_applied' => $applied,
                    'success' => true,
                ]);
            });

            return $response;
        } catch (\Throwable $e) {
            Log::error('SyncBridge orders/create beklenmeyen hata', [
                'order_id' => $orderIdStr,
                'message' => $e->getMessage(),
                'exception' => $e::class,
            ]);

            return response()->json([
                'received' => true,
                'order_id' => $orderIdStr,
                'success' => false,
                'error' => 'internal_error',
            ], 200);
        }
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
