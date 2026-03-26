<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\SyncLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductApiController extends Controller
{
    /**
     * Tüm ürünleri fiyat ve stok bilgisiyle döndür.
     * Shopify App bu API'yi çağırarak senkronizasyon yapar.
     */
    public function index(Request $request): JsonResponse
    {
        $syncMode = $request->query('sync_mode', 'full');
        $incremental = $syncMode === 'incremental';

        $query = Product::with(['inventory', 'priceTiers'])
            ->where('is_active', true);

        $products = $query->get();

        if ($incremental) {
            $products = $products->filter(fn (Product $p) => $p->needsIncrementalSync())->values();
        }

        $products = $products
            ->map(function (Product $product) {
                return [
                    'id' => $product->id,
                    'sku' => $product->sku,
                    'name' => $product->name,
                    'base_price' => (float) $product->base_price,
                    'shopify_product_id' => $product->shopify_product_id,
                    'shopify_variant_id' => $product->shopify_variant_id,
                    'in_shopify' => $product->in_shopify,
                    'inventory' => $product->getCurrentInventory(),
                    'price_tiers' => $product->priceTiers->map(fn ($tier) => [
                        'customer_tag' => $tier->customer_tag,
                        'price' => (float) $tier->price,
                        'min_quantity' => $tier->min_quantity,
                    ])->toArray(),
                ];
            })
            ->values();

        return response()->json([
            'success' => true,
            'data' => $products,
            'count' => $products->count(),
            'sync_mode' => $incremental ? 'incremental' : 'full',
        ]);
    }

    /**
     * SKU ile tek ürün getir.
     */
    public function show(string $sku): JsonResponse
    {
        $product = Product::with(['inventory', 'priceTiers'])
            ->where('sku', $sku)
            ->where('is_active', true)
            ->first();

        if (!$product) {
            return response()->json(['error' => 'Ürün bulunamadı'], 404);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'id' => $product->id,
                'sku' => $product->sku,
                'name' => $product->name,
                'base_price' => (float) $product->base_price,
                'shopify_product_id' => $product->shopify_product_id,
                'shopify_variant_id' => $product->shopify_variant_id,
                'in_shopify' => $product->in_shopify,
                'inventory' => $product->getCurrentInventory(),
                'price_tiers' => $product->priceTiers->map(fn ($tier) => [
                    'customer_tag' => $tier->customer_tag,
                    'price' => (float) $tier->price,
                    'min_quantity' => $tier->min_quantity,
                ])->toArray(),
            ],
        ]);
    }

    /**
     * Senkronizasyon loglarını döndür.
     */
    public function syncLogs(Request $request): JsonResponse
    {
        $shopDomain = $request->query('shop');

        $logs = SyncLog::when($shopDomain, fn ($q) => $q->where('shop_domain', $shopDomain))
            ->orderByDesc('created_at')
            ->limit(50)
            ->get();

        return response()->json([
            'success' => true,
            'data' => $logs,
        ]);
    }
}
