<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('fleet_settings', function (Blueprint $table) {
            $table->json('booking_sms_numbers')->nullable()->after('reservation_fee_deductible');
        });
    }

    public function down(): void
    {
        Schema::table('fleet_settings', function (Blueprint $table) {
            $table->dropColumn('booking_sms_numbers');
        });
    }
};
