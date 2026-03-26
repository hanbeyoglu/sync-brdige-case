<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ShopifyShop extends Model
{
    protected $fillable = [
        'domain',
        'access_token',
        'scope',
        'is_active',
    ];

    protected $hidden = [
        'access_token',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];
}
