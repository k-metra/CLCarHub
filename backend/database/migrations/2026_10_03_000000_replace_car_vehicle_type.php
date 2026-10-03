<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('vehicles')->where('type', 'car')->update(['type' => 'sedan']);
    }

    public function down(): void
    {
        DB::table('vehicles')->where('type', 'sedan')->update(['type' => 'car']);
    }
};
