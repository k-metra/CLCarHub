<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->timestamp('phone_verified_at')->nullable()->after('phone');
            $table->string('referral_source')->nullable()->after('phone_verified_at');
            $table->timestamp('onboarding_completed_at')->nullable()->after('referral_source');
            $table->index('onboarding_completed_at');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropIndex(['onboarding_completed_at']);
            $table->dropColumn(['phone_verified_at', 'referral_source', 'onboarding_completed_at']);
        });
    }
};
