<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table): void {
            $table->foreignId('discount_code_id')->nullable()->constrained()->nullOnDelete();
            $table->decimal('discount_code_amount', 12, 2)->default(0);
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table): void {
            $table->dropForeign(['discount_code_id']);
            $table->dropColumn(['discount_code_id', 'discount_code_amount']);
        });
    }
};
