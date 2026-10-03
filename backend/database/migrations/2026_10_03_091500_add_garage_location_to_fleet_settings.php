<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('fleet_settings', function (Blueprint $table) {
            $table->string('garage_location_name')->nullable();
            $table->text('garage_location_address')->nullable();
            $table->decimal('garage_location_latitude', 10, 7)->nullable();
            $table->decimal('garage_location_longitude', 10, 7)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('fleet_settings', function (Blueprint $table) {
            $table->dropColumn([
                'garage_location_name',
                'garage_location_address',
                'garage_location_latitude',
                'garage_location_longitude',
            ]);
        });
    }
};
