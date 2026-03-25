<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Product extends Model
{
    use HasFactory;

    protected $fillable = [
        'sku',
        'name',
        'description',
        'base_price',
        'shopify_product_id',
        'shopify_variant_id',
        'in_shopify',
        'is_active',
        'last_synced_at',
        'last_synced_hash',
    ];

    protected $casts = [
        'base_price' => 'decimal:2',
        'in_shopify' => 'boolean',
        'is_active' => 'boolean',
        'last_synced_at' => 'datetime',
    ];

    public function inventory(): HasMany
    {
        return $this->hasMany(ProductInventory::class);
    }

    public function priceTiers(): HasMany
    {
        return $this->hasMany(ProductPriceTier::class);
    }

    public function getCurrentInventory(): int
    {
        return (int) $this->inventory()->sum('quantity');
    }

    /**
     * Shopify senkronu için kararlı JSON fingerprint (sıra ve format sabit).
     *
     * @return array<string, mixed>
     */
    public function syncFingerprintPayload(): array
    {
        $this->loadMissing('priceTiers');

        $tiers = $this->priceTiers
            ->sortBy([
                ['customer_tag', 'asc'],
                ['min_quantity', 'asc'],
            ])
            ->values()
            ->map(fn (ProductPriceTier $t) => [
                'customer_tag' => $t->customer_tag,
                'price' => number_format((float) $t->price, 2, '.', ''),
                'min_quantity' => (int) $t->min_quantity,
            ])
            ->all();

        return [
            'base_price' => number_format((float) $this->base_price, 2, '.', ''),
            'in_shopify' => (bool) $this->in_shopify,
            'inventory' => $this->getCurrentInventory(),
            'price_tiers' => $tiers,
            'shopify_product_id' => $this->shopify_product_id,
            'shopify_variant_id' => $this->shopify_variant_id,
        ];
    }

    public function computeSyncHash(): string
    {
        return hash('sha256', json_encode($this->syncFingerprintPayload(), JSON_UNESCAPED_UNICODE));
    }

    public function needsIncrementalSync(): bool
    {
        if ($this->last_synced_at === null) {
            return true;
        }

        if ($this->in_shopify && (empty($this->shopify_product_id) || empty($this->shopify_variant_id))) {
            return true;
        }

        return $this->computeSyncHash() !== $this->last_synced_hash;
    }
}
