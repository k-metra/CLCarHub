<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('customer_loyalty_rewards', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('milestone_booking_count');
            $table->foreignId('earned_booking_id')->nullable()->constrained('bookings')->nullOnDelete();
            $table->foreignId('redeemed_booking_id')->nullable()->constrained('bookings')->nullOnDelete();
            $table->string('status')->default('available');
            $table->timestamps();
            $table->unique(['customer_id', 'milestone_booking_count'], 'loyalty_rewards_customer_milestone_unique');
            $table->index(['customer_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_loyalty_rewards');
    }
};
