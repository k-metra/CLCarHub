<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('booking_extension_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('booking_id')->constrained()->cascadeOnDelete();
            $table->dateTime('previous_return_at');
            $table->dateTime('new_return_at');
            $table->decimal('previous_extension_fees', 10, 2)->default(0);
            $table->decimal('new_extension_fees', 10, 2)->default(0);
            $table->boolean('previous_extension_pricing_applied')->default(false);
            $table->string('previous_extension_pricing_mode')->nullable();
            $table->string('extension_pricing_mode')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->dateTime('undone_at')->nullable();
            $table->foreignId('undone_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['booking_id', 'undone_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('booking_extension_histories');
    }
};
