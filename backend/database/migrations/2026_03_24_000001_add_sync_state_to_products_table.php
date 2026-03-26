<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->timestamp('last_synced_at')->nullable()->after('is_active');
            $table->string('last_synced_hash', 64)->nullable()->after('last_synced_at');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn(['last_synced_at', 'last_synced_hash']);
        });
    }
};
