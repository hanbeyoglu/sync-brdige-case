<?php

namespace App\Services;

/**
 * Shopify Admin API çağrıları bu projede Remix uygulamasında yapılır:
 * @see shopify-app/app/services/bulkSync.server.js (metafieldsSet)
 *
 * B2B tier fiyat metafield sözleşmesi (Admin'deki tanımlarla uyumlu):
 * - Kaynak: Product (owner = shopify_product_id GID)
 * - Namespace: custom
 * - Anahtarlar: customer_tag ile aynı (retail, vip, wholesale)
 * - Tip: number_decimal, değer: ondalık string (örn. "375.62")
 */
final class ShopifyService
{
    private function __construct() {}
}
