<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('addons', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            $table->text('description');
            $table->string('image_path')->nullable();
            $table->json('vehicle_types');
            $table->json('pricing_tiers');
            $table->boolean('is_rental')->default(false);
            $table->unsignedInteger('stock')->nullable();
            $table->string('status')->default('available')->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('addons');
    }
};
