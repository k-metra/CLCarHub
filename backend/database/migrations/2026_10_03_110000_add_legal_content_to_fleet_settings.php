<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('fleet_settings', function (Blueprint $table) {
            $table->longText('terms_and_conditions')->nullable();
            $table->longText('privacy_policy')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('fleet_settings', function (Blueprint $table) {
            $table->dropColumn(['terms_and_conditions', 'privacy_policy']);
        });
    }
};
