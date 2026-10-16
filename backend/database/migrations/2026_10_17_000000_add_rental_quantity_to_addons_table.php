<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('addons', function (Blueprint $table) {
            $table->unsignedInteger('rental_quantity')->default(1)->after('stock');
        });
    }

    public function down(): void
    {
        Schema::table('addons', function (Blueprint $table) {
            $table->dropColumn('rental_quantity');
        });
    }
};
