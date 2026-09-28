<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('vehicles', function (Blueprint $table) {
            $table->id();
            $table->string('brand');
            $table->string('model');
            $table->string('variant')->nullable();
            $table->unsignedSmallInteger('year')->nullable();
            $table->string('type')->index();
            $table->string('plate_number')->unique();
            $table->string('transmission')->nullable();
            $table->string('fuel_type')->nullable();
            $table->unsignedTinyInteger('seats')->nullable();
            $table->string('color')->nullable();
            $table->decimal('daily_rate', 10, 2);
            $table->decimal('weekly_rate', 10, 2)->nullable();
            $table->decimal('monthly_rate', 10, 2)->nullable();
            $table->decimal('deposit', 10, 2)->default(0);
            $table->text('description')->nullable();
            $table->string('status')->default('available')->index();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('vehicles');
    }
};
