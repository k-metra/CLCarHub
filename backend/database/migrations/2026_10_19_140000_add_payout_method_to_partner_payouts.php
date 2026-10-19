<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('partner_payouts', function (Blueprint $table) {
            $table->foreignId('partner_payout_method_id')->nullable()->after('fund_id')->constrained('partner_payout_methods')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('partner_payouts', function (Blueprint $table) {
            $table->dropForeign(['partner_payout_method_id']);
            $table->dropColumn('partner_payout_method_id');
        });
    }
};
