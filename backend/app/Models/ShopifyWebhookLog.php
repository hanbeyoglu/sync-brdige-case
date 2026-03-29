<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ShopifyWebhookLog extends Model
{
    protected $fillable = [
        'topic',
        'shopify_order_id',
    ];
}
