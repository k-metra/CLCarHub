<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\User;
use App\Models\Vehicle;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BookingAvailabilityTest extends TestCase
{
    use RefreshDatabase;

    public function test_booking_rejects_an_overlapping_active_period(): void
    {
        $owner = User::factory()->create(['role' => 'owner']);
        $vehicle = Vehicle::create(['brand' => 'Toyota', 'model' => 'Corolla', 'type' => 'car', 'plate_number' => 'ABC-123', 'daily_rate' => 2000, 'status' => 'available']);
        $customer = Customer::create(['name' => 'First Customer', 'phone' => '09170000000']);
        $otherCustomer = Customer::create(['name' => 'Second Customer', 'phone' => '09170000001']);
        Sanctum::actingAs($owner);

        $this->postJson('/api/bookings', ['customer_id' => $customer->id, 'vehicle_id' => $vehicle->id, 'pickup_at' => '2030-01-10 10:00', 'return_at' => '2030-01-12 10:00'])->assertCreated();

        $this->postJson('/api/bookings', ['customer_id' => $otherCustomer->id, 'vehicle_id' => $vehicle->id, 'pickup_at' => '2030-01-11 14:00', 'return_at' => '2030-01-13 10:00'])->assertUnprocessable();
        $this->assertCount(1, Booking::all());
    }
}
