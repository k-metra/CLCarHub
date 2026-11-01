<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vehicles', function (Blueprint $table): void {
            $table->string('garage_location', 20)->default('calamba')->after('delivery_rate_per_km');
        });
    }

    public function down(): void
    {
        Schema::table('vehicles', function (Blueprint $table): void {
            $table->dropColumn('garage_location');
        });
    }
};
