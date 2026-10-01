<?php

use App\Models\Customer;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    public function up(): void
    {
        Customer::with('user')->whereNotNull('user_id')->each(function (Customer $customer) {
            if (! $customer->user) {
                return;
            }

            $user = $customer->user;
            $firstName = $user->first_name ?: $customer->first_name;
            $middleName = $user->middle_name ?: $customer->middle_name;
            $lastName = $user->last_name ?: $customer->last_name;
            $name = trim(implode(' ', array_filter([$firstName, $middleName, $lastName]))) ?: $customer->name;

            $customer->update([
                'first_name' => $firstName,
                'middle_name' => $middleName,
                'last_name' => $lastName,
                'name' => $name,
                'date_of_birth' => $user->date_of_birth ?: $customer->date_of_birth,
            ]);
            $user->update([
                'first_name' => $firstName,
                'middle_name' => $middleName,
                'last_name' => $lastName,
                'name' => $name,
                'date_of_birth' => $user->date_of_birth ?: $customer->date_of_birth,
            ]);
        });
    }

    public function down(): void
    {
        //
    }
};
