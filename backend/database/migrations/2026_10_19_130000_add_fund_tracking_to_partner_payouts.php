<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('partner_payouts', function (Blueprint $table) {
            $table->foreignId('fund_id')->nullable()->after('partner_id')->constrained('funds')->nullOnDelete();
        });

        Schema::table('fund_transactions', function (Blueprint $table) {
            $table->foreignId('partner_payout_id')->nullable()->after('payment_id')->unique()->constrained('partner_payouts')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('fund_transactions', function (Blueprint $table) {
            $table->dropForeign(['partner_payout_id']);
            $table->dropUnique(['partner_payout_id']);
            $table->dropColumn('partner_payout_id');
        });

        Schema::table('partner_payouts', function (Blueprint $table) {
            $table->dropForeign(['fund_id']);
            $table->dropColumn('fund_id');
        });
    }
};
