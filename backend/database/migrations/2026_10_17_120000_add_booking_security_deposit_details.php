<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->string('security_deposit_type')->default('cash')->after('deposit');
            $table->text('security_deposit_asset')->nullable()->after('security_deposit_type');
            $table->timestamp('security_deposit_returned_at')->nullable()->after('security_deposit_asset');
            $table->foreignId('security_deposit_returned_by')
                ->nullable()
                ->after('security_deposit_returned_at')
                ->constrained('users')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropConstrainedForeignId('security_deposit_returned_by');
            $table->dropColumn([
                'security_deposit_type',
                'security_deposit_asset',
                'security_deposit_returned_at',
            ]);
        });
    }
};
