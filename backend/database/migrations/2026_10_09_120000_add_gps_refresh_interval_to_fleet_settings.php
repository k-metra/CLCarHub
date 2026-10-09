<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('fleet_settings', function (Blueprint $table): void {
            $table->unsignedInteger('gps_refresh_interval_seconds')->default(30)->after('late_return_grace_period_minutes');
        });
    }

    public function down(): void
    {
        Schema::table('fleet_settings', function (Blueprint $table): void {
            $table->dropColumn('gps_refresh_interval_seconds');
        });
    }
};
