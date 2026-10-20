<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->string('phone_verification_code_hash')->nullable()->after('phone_verified_at');
            $table->timestamp('phone_verification_expires_at')->nullable()->after('phone_verification_code_hash');
            $table->timestamp('phone_verification_sent_at')->nullable()->after('phone_verification_expires_at');
            $table->unsignedTinyInteger('phone_verification_attempts')->default(0)->after('phone_verification_sent_at');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn([
                'phone_verification_code_hash',
                'phone_verification_expires_at',
                'phone_verification_sent_at',
                'phone_verification_attempts',
            ]);
        });
    }
};
