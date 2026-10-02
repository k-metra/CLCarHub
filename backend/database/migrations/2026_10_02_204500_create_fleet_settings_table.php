<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('fleet_settings', function (Blueprint $table) {
            $table->id();
            $table->decimal('reservation_fee', 10, 2)->default(0);
            $table->boolean('reservation_fee_deductible')->default(true);
            $table->timestamps();
        });

        DB::table('fleet_settings')->insert([
            'id' => 1,
            'reservation_fee' => 0,
            'reservation_fee_deductible' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('fleet_settings');
    }
};
