<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('rfid_balance_inquiries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('vehicle_id')->constrained()->cascadeOnDelete();
            $table->string('provider');
            $table->string('account_hash', 64)->index();
            $table->text('account_number');
            $table->string('status')->default('pending')->index();
            $table->string('message_id')->nullable()->unique();
            $table->decimal('balance', 10, 2)->nullable();
            $table->timestamp('requested_at');
            $table->timestamp('expires_at');
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('rfid_balance_inquiries');
    }
};
