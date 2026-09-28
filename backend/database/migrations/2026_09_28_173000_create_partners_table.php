<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('partners', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('email');
            $table->string('contact_number');
            $table->text('address');
            $table->string('commission_based_on');
            $table->string('commission_type');
            $table->decimal('commission_value', 10, 2);
            $table->timestamps();
        });

        Schema::table('vehicles', function (Blueprint $table) {
            $table->foreignId('partner_id')->nullable()->constrained('partners')->nullOnDelete();
            $table->decimal('reservation_fee', 10, 2)->nullable();
            $table->decimal('security_deposit_fee', 10, 2)->nullable();
            $table->string('ownership')->default('CL CarHub');
        });
    }

    public function down(): void
    {
        Schema::table('vehicles', function (Blueprint $table) {
            $table->dropConstrainedForeignId('partner_id');
            $table->dropColumn(['reservation_fee', 'security_deposit_fee', 'ownership']);
        });
        Schema::dropIfExists('partners');
    }
};
