<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->decimal('return_latitude', 10, 7)->nullable()->after('return_address');
            $table->decimal('return_longitude', 10, 7)->nullable()->after('return_latitude');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table) {
            $table->dropColumn(['return_latitude', 'return_longitude']);
        });
    }
};
