<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->foreignId('fund_id')->nullable()->after('booking_id')->constrained()->nullOnDelete();
        });
        Schema::table('expenses', function (Blueprint $table) {
            $table->foreignId('fund_id')->nullable()->after('vehicle_id')->constrained()->nullOnDelete();
        });
        Schema::table('fund_transactions', function (Blueprint $table) {
            $table->foreignId('payment_id')->nullable()->unique()->after('fund_id')->constrained()->cascadeOnDelete();
            $table->foreignId('expense_id')->nullable()->unique()->after('payment_id')->constrained()->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('fund_transactions', function (Blueprint $table) {
            $table->dropForeign(['payment_id']);
            $table->dropForeign(['expense_id']);
            $table->dropUnique(['payment_id']);
            $table->dropUnique(['expense_id']);
            $table->dropColumn(['payment_id', 'expense_id']);
        });
        Schema::table('payments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('fund_id');
        });
        Schema::table('expenses', function (Blueprint $table) {
            $table->dropConstrainedForeignId('fund_id');
        });
    }
};
