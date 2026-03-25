<?php

namespace Database\Seeders;

use App\Models\Product;
use App\Models\ProductInventory;
use App\Models\ProductPriceTier;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        User::factory()->create([
            'name' => 'Admin',
            'email' => 'admin@syncbridge.local',
            'password' => Hash::make('password'),
        ]);

        // 25 SKU - 15'i Shopify'da, 10'u sadece Laravel'de
        $skus = [];
        for ($i = 1; $i <= 25; $i++) {
            $skus[] = 'SKU-' . str_pad((string) $i, 3, '0', STR_PAD_LEFT);
        }

        foreach ($skus as $index => $sku) {
            $inShopify = $index < 15;
            $product = Product::create([
                'sku' => $sku,
                'name' => "Örnek Ürün {$sku}",
                'description' => "SyncBridge B2B - {$sku} açıklaması",
                'base_price' => rand(50, 500) + (rand(0, 99) / 100),
                'in_shopify' => $inShopify,
                'is_active' => true,
            ]);

            ProductInventory::create([
                'product_id' => $product->id,
                'quantity' => rand(10, 200),
                'location' => 'default',
            ]);

            // B2B fiyat katmanları - tag bazlı
            foreach (['wholesale', 'retail', 'vip'] as $tag) {
                $discount = match ($tag) {
                    'wholesale' => 0.75,
                    'retail' => 0.90,
                    'vip' => 0.65,
                    default => 1,
                };
                ProductPriceTier::create([
                    'product_id' => $product->id,
                    'customer_tag' => $tag,
                    'price' => round($product->base_price * $discount, 2),
                    'min_quantity' => $tag === 'wholesale' ? 10 : 1,
                ]);
            }
        }
    }
}
