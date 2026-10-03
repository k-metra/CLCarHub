<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->decimal('delivery_distance_km', 10, 2)->nullable()->after('delivery_address');
            $table->decimal('delivery_rate_per_km', 10, 2)->nullable()->after('delivery_distance_km');
            $table->decimal('delivery_fee', 10, 2)->default(0)->after('delivery_rate_per_km');
            $table->decimal('delivery_latitude', 10, 7)->nullable()->after('delivery_fee');
            $table->decimal('delivery_longitude', 10, 7)->nullable()->after('delivery_latitude');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn([
                'delivery_distance_km',
                'delivery_rate_per_km',
                'delivery_fee',
                'delivery_latitude',
                'delivery_longitude',
            ]);
        });
    }
};
