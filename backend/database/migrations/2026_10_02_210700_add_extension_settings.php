<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('fleet_settings', function (Blueprint $table) {
            $table->decimal('default_hour_extension_rate', 10, 2)->default(200)->after('reservation_fee_deductible');
            $table->unsignedTinyInteger('full_day_extension_threshold_hours')->default(12)->after('default_hour_extension_rate');
        });

        Schema::table('vehicles', function (Blueprint $table) {
            $table->decimal('hour_extension_rate', 10, 2)->nullable()->after('daily_rate');
        });
    }

    public function down(): void
    {
        Schema::table('vehicles', function (Blueprint $table) {
            $table->dropColumn('hour_extension_rate');
        });

        Schema::table('fleet_settings', function (Blueprint $table) {
            $table->dropColumn(['default_hour_extension_rate', 'full_day_extension_threshold_hours']);
        });
    }
};
