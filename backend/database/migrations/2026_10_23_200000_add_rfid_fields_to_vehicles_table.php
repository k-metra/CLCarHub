<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('vehicles', function (Blueprint $table) {
            $table->boolean('rfid_enabled')->default(false)->after('plate_number');
            $table->string('rfid_provider')->nullable()->after('rfid_enabled');
            $table->text('rfid_account_number')->nullable()->after('rfid_provider');
            $table->decimal('rfid_balance', 10, 2)->nullable()->after('rfid_account_number');
            $table->timestamp('rfid_balance_retrieved_at')->nullable()->after('rfid_balance');
        });
    }

    public function down(): void
    {
        Schema::table('vehicles', function (Blueprint $table) {
            $table->dropColumn([
                'rfid_enabled',
                'rfid_provider',
                'rfid_account_number',
                'rfid_balance',
                'rfid_balance_retrieved_at',
            ]);
        });
    }
};
