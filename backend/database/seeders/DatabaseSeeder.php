<?php

namespace Database\Seeders;

use App\Models\Customer;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // User::factory(10)->create();

        User::query()->updateOrCreate(['email' => 'owner@clcarhub.com'], [
            'name' => 'CL CarHub Owner',
            'password' => 'password',
            'role' => 'owner',
            'status' => 'active',
            'email_verified_at' => now(),
        ]);

        $customerUser = User::query()->updateOrCreate(['email' => 'customer@clcarhub.com'], [
            'name' => 'CL CarHub Customer',
            'first_name' => 'CL',
            'last_name' => 'Customer',
            'password' => 'password',
            'role' => 'customer',
            'status' => 'active',
            'email_verified_at' => now(),
        ]);

        Customer::query()->updateOrCreate(['user_id' => $customerUser->id], [
            'name' => $customerUser->name,
            'first_name' => $customerUser->first_name,
            'last_name' => $customerUser->last_name,
            'email' => $customerUser->email,
            'phone' => '09170000000',
        ]);
    }
}
