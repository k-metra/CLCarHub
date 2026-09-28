<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->string('destination')->nullable();
            $table->string('delivery_address')->nullable();
            $table->string('return_address')->nullable();
            $table->decimal('fuel_charge', 10, 2)->default(0);
            $table->decimal('rfid_charge', 10, 2)->default(0);
            $table->decimal('damage_fees', 10, 2)->default(0);
            $table->decimal('car_wash_fees', 10, 2)->default(0);
            $table->decimal('extension_fees', 10, 2)->default(0);
        });

        Schema::table('payments', function (Blueprint $table) {
            $table->string('payment_method')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn(['destination', 'delivery_address', 'return_address', 'fuel_charge', 'rfid_charge', 'damage_fees', 'car_wash_fees', 'extension_fees']);
        });
    }
};
