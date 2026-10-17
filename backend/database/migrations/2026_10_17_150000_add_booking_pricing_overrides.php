<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table): void {
            $table->decimal('delivery_rate_override', 10, 2)->nullable()->after('delivery_rate_per_km');
            $table->decimal('custom_delivery_fee', 10, 2)->nullable()->after('delivery_fee');
            $table->decimal('discount_percent_override', 5, 2)->nullable()->after('discount');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table): void {
            $table->dropColumn(['delivery_rate_override', 'custom_delivery_fee', 'discount_percent_override']);
        });
    }
};
