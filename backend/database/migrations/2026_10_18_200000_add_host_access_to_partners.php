<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('partners', function (Blueprint $table) {
            $table->foreignId('user_id')->nullable()->unique()->after('id')->constrained('users')->nullOnDelete();
            $table->string('host_access_status')->default('not_provisioned')->index();
            $table->timestamp('host_access_granted_at')->nullable();
            $table->timestamp('host_access_revoked_at')->nullable();
        });

    }

    public function down(): void
    {
        Schema::table('partners', function (Blueprint $table) {
            $table->dropConstrainedForeignId('user_id');
            $table->dropColumn(['host_access_status', 'host_access_granted_at', 'host_access_revoked_at']);
        });
    }
};
