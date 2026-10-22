<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('discount_codes', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('code')->unique();
            $table->string('type');
            $table->decimal('value', 12, 2);
            $table->decimal('maximum_discount', 12, 2)->nullable();
            $table->unsignedInteger('redemptions_allowed')->nullable();
            $table->unsignedInteger('redemptions_count')->default(0);
            $table->dateTime('starts_at')->nullable();
            $table->dateTime('ends_at')->nullable();
            $table->decimal('minimum_booking_amount', 12, 2)->nullable();
            $table->json('vehicle_types')->nullable();
            $table->unsignedInteger('minimum_duration_hours')->nullable();
            $table->boolean('new_customers_only')->default(false);
            $table->boolean('stackable')->default(false);
            $table->string('status')->default('draft');
            $table->unsignedInteger('limit_per_customer')->default(1);
            $table->timestamps();
        });

        Schema::create('discount_code_customers', function (Blueprint $table): void {
            $table->foreignId('discount_code_id')->constrained()->cascadeOnDelete();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->primary(['discount_code_id', 'customer_id']);
        });

        Schema::create('discount_code_redemptions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('discount_code_id')->constrained()->cascadeOnDelete();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->foreignId('booking_id')->constrained()->cascadeOnDelete();
            $table->decimal('amount', 12, 2);
            $table->timestamps();
            $table->unique(['discount_code_id', 'booking_id']);
            $table->index(['discount_code_id', 'customer_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('discount_code_redemptions');
        Schema::dropIfExists('discount_code_customers');
        Schema::dropIfExists('discount_codes');
    }
};
