<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->string('paymongo_checkout_session_id')->nullable()->unique()->after('payment_status');
        });

        Schema::table('payments', function (Blueprint $table) {
            $table->string('provider')->nullable()->index()->after('payment_method');
            $table->string('provider_reference')->nullable()->unique()->after('reference');
        });
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->dropUnique(['provider_reference']);
            $table->dropColumn('provider_reference');
            $table->dropIndex(['provider']);
            $table->dropColumn('provider');
        });

        Schema::table('bookings', function (Blueprint $table) {
            $table->dropUnique(['paymongo_checkout_session_id']);
            $table->dropColumn('paymongo_checkout_session_id');
        });
    }
};
