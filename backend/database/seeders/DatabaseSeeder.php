<?php

namespace Database\Seeders;

use App\Models\Customer;
use App\Models\Partner;
use App\Models\PartnerVehicleContract;
use App\Models\User;
use App\Models\Vehicle;
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

        $owner = User::query()->updateOrCreate(['email' => 'owner@clcarhub.com'], [
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

        $partners = [
            [
                'first_name' => 'Metro Mobility',
                'last_name' => 'Partners',
                'name' => 'Partners, Metro Mobility',
                'email' => 'metro.mobility@example.com',
                'contact_number' => '09171234567',
                'address' => 'Makati City, Metro Manila',
                'commission_based_on' => 'base_rent_only',
                'commission_type' => 'percentage',
                'commission_value' => 20,
            ],
            [
                'first_name' => 'Island Drive',
                'last_name' => 'Rentals',
                'name' => 'Rentals, Island Drive',
                'email' => 'island.drive@example.com',
                'contact_number' => '09179876543',
                'address' => 'Cebu City, Cebu',
                'commission_based_on' => 'total_booking_amount',
                'commission_type' => 'percentage',
                'commission_value' => 18,
            ],
        ];

        $partnerRecords = collect($partners)->mapWithKeys(function (array $attributes): array {
            $partner = Partner::query()->updateOrCreate(
                ['email' => $attributes['email']],
                $attributes,
            );

            return [$attributes['email'] => $partner];
        });

        $vehicles = [
            [
                'plate_number' => 'NCR-1001',
                'brand' => 'Toyota',
                'model' => 'Vios',
                'variant' => '1.3 XLE',
                'year' => 2023,
                'type' => 'sedan',
                'transmission' => 'automatic',
                'fuel_type' => 'regular_unleaded',
                'seats' => 5,
                'color' => 'Pearl White',
                'daily_rate' => 1800,
                'weekly_rate' => 10500,
                'monthly_rate' => 36000,
                'deposit' => 5000,
                'security_deposit_fee' => 1500,
                'ownership' => 'Partner',
                'partner_id' => $partnerRecords['metro.mobility@example.com']->id,
                'status' => 'available',
                'description' => 'Comfortable automatic sedan for city and airport trips.',
            ],
            [
                'plate_number' => 'NCR-1002',
                'brand' => 'Honda',
                'model' => 'BR-V',
                'variant' => 'S CVT',
                'year' => 2022,
                'type' => 'crossover',
                'transmission' => 'automatic',
                'fuel_type' => 'regular_unleaded',
                'seats' => 7,
                'color' => 'Modern Steel',
                'daily_rate' => 2500,
                'weekly_rate' => 15000,
                'monthly_rate' => 52000,
                'deposit' => 7000,
                'security_deposit_fee' => 2000,
                'ownership' => 'Partner',
                'partner_id' => $partnerRecords['metro.mobility@example.com']->id,
                'status' => 'available',
                'description' => 'Seven-seat crossover suited for family travel.',
            ],
            [
                'plate_number' => 'CEB-2001',
                'brand' => 'Toyota',
                'model' => 'Innova',
                'variant' => '2.8 V Diesel',
                'year' => 2021,
                'type' => 'mpv',
                'transmission' => 'automatic',
                'fuel_type' => 'diesel',
                'seats' => 8,
                'color' => 'Silver',
                'daily_rate' => 3200,
                'weekly_rate' => 19500,
                'monthly_rate' => 68000,
                'deposit' => 8000,
                'security_deposit_fee' => 2500,
                'ownership' => 'Partner',
                'partner_id' => $partnerRecords['island.drive@example.com']->id,
                'status' => 'available',
                'description' => 'Spacious MPV for group trips and provincial travel.',
            ],
            [
                'plate_number' => 'CEB-2002',
                'brand' => 'Mitsubishi',
                'model' => 'Xpander',
                'variant' => 'GLS Sport',
                'year' => 2023,
                'type' => 'mpv',
                'transmission' => 'automatic',
                'fuel_type' => 'regular_unleaded',
                'seats' => 7,
                'color' => 'Red Diamond',
                'daily_rate' => 2800,
                'weekly_rate' => 17000,
                'monthly_rate' => 59000,
                'deposit' => 7000,
                'security_deposit_fee' => 2000,
                'ownership' => 'Partner',
                'partner_id' => $partnerRecords['island.drive@example.com']->id,
                'status' => 'available',
                'description' => 'Modern seven-seat MPV with flexible luggage space.',
            ],
        ];

        foreach ($vehicles as $attributes) {
            $vehicle = Vehicle::query()->updateOrCreate(
                ['plate_number' => $attributes['plate_number']],
                $attributes,
            );

            PartnerVehicleContract::query()->updateOrCreate(
                ['partner_id' => $vehicle->partner_id, 'vehicle_id' => $vehicle->id],
                [
                    'status' => 'approved',
                    'starts_at' => now()->toDateString(),
                    'ends_at' => null,
                    'terms' => 'Seeded demo partnership contract.',
                    'approved_at' => now(),
                    'approved_by' => $owner->id,
                ],
            );
        }
    }
}
