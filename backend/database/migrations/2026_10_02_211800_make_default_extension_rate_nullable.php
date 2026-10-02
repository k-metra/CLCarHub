<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('fleet_settings', function (Blueprint $table) {
            $table->decimal('default_hour_extension_rate', 10, 2)->nullable()->default(200)->change();
        });
    }

    public function down(): void
    {
        Schema::table('fleet_settings', function (Blueprint $table) {
            $table->decimal('default_hour_extension_rate', 10, 2)->nullable(false)->default(200)->change();
        });
    }
};
