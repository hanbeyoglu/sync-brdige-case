<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SyncLog extends Model
{
    protected $fillable = [
        'shop_domain',
        'sync_type',
        'status',
        'message',
        'items_processed',
        'items_failed',
        'started_at',
        'completed_at',
        'metadata',
    ];

    protected $casts = [
        'started_at' => 'datetime',
        'completed_at' => 'datetime',
        'metadata' => 'array',
        'items_processed' => 'integer',
        'items_failed' => 'integer',
    ];

    public const TYPE_MANUAL = 'manual';
    public const TYPE_INCREMENTAL = 'incremental';
    public const TYPE_WEBHOOK = 'webhook';

    public const STATUS_PENDING = 'pending';
    public const STATUS_RUNNING = 'running';
    public const STATUS_COMPLETED = 'completed';
    public const STATUS_FAILED = 'failed';
}
