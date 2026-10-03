<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('fleet_settings', function (Blueprint $table) {
            $table->decimal('default_delivery_rate_per_km', 10, 2)->default(0)->after('late_return_grace_period_minutes');
        });

        Schema::table('vehicles', function (Blueprint $table) {
            $table->decimal('delivery_rate_per_km', 10, 2)->nullable()->after('security_deposit_fee');
        });
    }

    public function down(): void
    {
        Schema::table('vehicles', function (Blueprint $table) {
            $table->dropColumn('delivery_rate_per_km');
        });

        Schema::table('fleet_settings', function (Blueprint $table) {
            $table->dropColumn('default_delivery_rate_per_km');
        });
    }
};
