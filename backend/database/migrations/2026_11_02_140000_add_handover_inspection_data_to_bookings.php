<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table): void {
            $table->string('handover_easytrip')->nullable();
            $table->string('handover_autosweep')->nullable();
            $table->unsignedTinyInteger('handover_fuel_bars')->nullable();
            $table->string('return_easytrip')->nullable();
            $table->string('return_autosweep')->nullable();
            $table->unsignedTinyInteger('return_fuel_bars')->nullable();
        });

        Schema::table('booking_return_photos', function (Blueprint $table): void {
            $table->string('stage')->default('return')->after('booking_id');
            $table->index(['booking_id', 'stage']);
        });
    }

    public function down(): void
    {
        Schema::table('booking_return_photos', function (Blueprint $table): void {
            $table->dropIndex(['booking_id', 'stage']);
            $table->dropColumn('stage');
        });

        Schema::table('bookings', function (Blueprint $table): void {
            $table->dropColumn([
                'handover_easytrip',
                'handover_autosweep',
                'handover_fuel_bars',
                'return_easytrip',
                'return_autosweep',
                'return_fuel_bars',
            ]);
        });
    }
};
