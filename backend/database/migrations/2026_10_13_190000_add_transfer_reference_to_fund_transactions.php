<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('fund_transactions', function (Blueprint $table): void {
            $table->string('transfer_reference')->nullable()->index()->after('payment_id');
        });
    }

    public function down(): void
    {
        Schema::table('fund_transactions', function (Blueprint $table): void {
            $table->dropIndex(['transfer_reference']);
            $table->dropColumn('transfer_reference');
        });
    }
};
