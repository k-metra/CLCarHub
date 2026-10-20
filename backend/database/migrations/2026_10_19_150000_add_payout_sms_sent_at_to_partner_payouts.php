<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('partner_payouts', function (Blueprint $table) {
            $table->timestamp('payout_sms_sent_at')->nullable()->after('notes');
        });
    }

    public function down(): void
    {
        Schema::table('partner_payouts', function (Blueprint $table) {
            $table->dropColumn('payout_sms_sent_at');
        });
    }
};
