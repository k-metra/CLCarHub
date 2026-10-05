<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('bookings')->whereIn('status', ['reserved', 'confirmed', 'awaiting_payment', 'paid'])->update(['status' => 'upcoming']);
        DB::table('bookings')->where('status', 'active')->update(['status' => 'ongoing']);
        DB::table('bookings')->where('status', 'completed')->update(['status' => 'complete']);
        DB::table('booking_status_histories')->whereIn('to_status', ['reserved', 'confirmed', 'awaiting_payment', 'paid'])->update(['to_status' => 'upcoming']);
        DB::table('booking_status_histories')->whereIn('from_status', ['reserved', 'confirmed', 'awaiting_payment', 'paid'])->update(['from_status' => 'upcoming']);
        DB::table('booking_status_histories')->where('to_status', 'active')->update(['to_status' => 'ongoing']);
        DB::table('booking_status_histories')->where('from_status', 'active')->update(['from_status' => 'ongoing']);
        DB::table('booking_status_histories')->where('to_status', 'completed')->update(['to_status' => 'complete']);
        DB::table('booking_status_histories')->where('from_status', 'completed')->update(['from_status' => 'complete']);
    }

    public function down(): void
    {
        DB::table('bookings')->where('status', 'upcoming')->update(['status' => 'reserved']);
        DB::table('bookings')->where('status', 'ongoing')->update(['status' => 'active']);
        DB::table('bookings')->where('status', 'complete')->update(['status' => 'completed']);
    }
};
