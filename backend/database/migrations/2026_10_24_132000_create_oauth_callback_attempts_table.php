<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('oauth_callback_attempts', function (Blueprint $table): void {
            $table->id();
            $table->string('provider', 32);
            $table->string('code_hash', 64)->unique();
            $table->string('status', 16)->default('processing');
            $table->text('redirect_url')->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamps();
            $table->index(['provider', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('oauth_callback_attempts');
    }
};
