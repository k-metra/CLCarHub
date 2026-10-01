<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('bookings')->where('status', 'confirmed')->update(['status' => 'reserved']);
        DB::table('booking_status_histories')->where('to_status', 'confirmed')->update(['to_status' => 'reserved']);
        DB::table('booking_status_histories')->where('from_status', 'confirmed')->update(['from_status' => 'reserved']);
    }

    public function down(): void
    {
        DB::table('bookings')->where('status', 'reserved')->update(['status' => 'confirmed']);
        DB::table('booking_status_histories')->where('to_status', 'reserved')->update(['to_status' => 'confirmed']);
        DB::table('booking_status_histories')->where('from_status', 'reserved')->update(['from_status' => 'confirmed']);
    }
};
