<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ip_blocks', function (Blueprint $table) {
            $table->id();
            $table->ipAddress('ip_address');
            $table->string('scope')->default('bookings');
            $table->string('reason')->nullable();
            $table->foreignId('blocked_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['ip_address', 'scope']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ip_blocks');
    }
};
