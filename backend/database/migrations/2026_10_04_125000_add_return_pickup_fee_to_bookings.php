<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->decimal('return_distance_km', 10, 2)->nullable()->after('return_longitude');
            $table->decimal('return_pickup_fee', 10, 2)->default(0)->after('return_distance_km');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn(['return_distance_km', 'return_pickup_fee']);
        });
    }
};
