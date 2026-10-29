<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vehicles', function (Blueprint $table): void {
            $table->decimal('outside_laguna_rate', 10, 2)->nullable()->after('daily_rate');
        });

        Schema::table('bookings', function (Blueprint $table): void {
            $table->string('destination_province')->nullable()->after('destination');
            $table->string('destination_city')->nullable()->after('destination_province');
            $table->string('destination_zone')->nullable()->after('destination_city');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table): void {
            $table->dropColumn(['destination_province', 'destination_city', 'destination_zone']);
        });
        Schema::table('vehicles', function (Blueprint $table): void {
            $table->dropColumn('outside_laguna_rate');
        });
    }
};
