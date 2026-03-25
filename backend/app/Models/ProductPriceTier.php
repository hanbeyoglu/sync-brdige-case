<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductPriceTier extends Model
{
    protected $fillable = [
        'product_id',
        'customer_tag',
        'price',
        'min_quantity',
    ];

    protected $casts = [
        'price' => 'decimal:2',
        'min_quantity' => 'integer',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
