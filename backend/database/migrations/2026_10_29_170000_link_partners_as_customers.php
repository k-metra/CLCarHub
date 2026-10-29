<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('partners')->orderBy('id')->each(function (object $partner): void {
            $userId = $partner->user_id ?? null;
            $existing = $userId
                ? DB::table('customers')->where('user_id', $userId)->first()
                : DB::table('customers')->whereNull('user_id')->where('email', $partner->email)->first();

            if ($existing) {
                if ($userId && ! $existing->user_id) {
                    DB::table('customers')->where('id', $existing->id)->update(['user_id' => $userId]);
                }
                return;
            }

            DB::table('customers')->insert([
                'user_id' => $userId,
                'name' => $partner->name,
                'first_name' => $partner->first_name ?? null,
                'middle_name' => $partner->middle_name ?? null,
                'last_name' => $partner->last_name ?? null,
                'email' => $partner->email,
                'phone' => $partner->contact_number,
                'address' => $partner->address,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        });
    }

    public function down(): void
    {
        // Partner customer profiles may contain bookings and should not be removed on rollback.
    }
};
