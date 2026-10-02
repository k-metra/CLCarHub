<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('fleet_settings', function (Blueprint $table) {
            $table->unsignedSmallInteger('late_return_grace_period_minutes')->default(60)->after('full_day_extension_threshold_hours');
        });
    }

    public function down(): void
    {
        Schema::table('fleet_settings', function (Blueprint $table) {
            $table->dropColumn('late_return_grace_period_minutes');
        });
    }
};
