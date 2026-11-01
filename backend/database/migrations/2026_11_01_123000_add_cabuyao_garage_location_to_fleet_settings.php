<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('fleet_settings', function (Blueprint $table): void {
            $table->string('cabuyao_garage_location_name')->nullable();
            $table->text('cabuyao_garage_location_address')->nullable();
            $table->decimal('cabuyao_garage_location_latitude', 10, 7)->nullable();
            $table->decimal('cabuyao_garage_location_longitude', 10, 7)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('fleet_settings', function (Blueprint $table): void {
            $table->dropColumn([
                'cabuyao_garage_location_name',
                'cabuyao_garage_location_address',
                'cabuyao_garage_location_latitude',
                'cabuyao_garage_location_longitude',
            ]);
        });
    }
};
