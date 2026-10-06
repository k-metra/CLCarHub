<?php

namespace Database\Seeders;

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
    }
}
