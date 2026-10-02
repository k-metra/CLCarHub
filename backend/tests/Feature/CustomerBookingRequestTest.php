<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\User;
use App\Models\Vehicle;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CustomerBookingRequestTest extends TestCase
{
    use RefreshDatabase;

    public function test_customer_can_create_a_pending_unpaid_request_without_setting_pricing(): void
    {
        $user = User::factory()->create(['role' => 'customer']);
        $customer = $user->customer()->create(['name' => 'Customer', 'phone' => '09170000000']);
        $vehicle = Vehicle::create(['brand' => 'Toyota', 'model' => 'Vios', 'type' => 'car', 'plate_number' => 'CUS-123', 'daily_rate' => 2000, 'status' => 'available']);
        Sanctum::actingAs($user);

        $response = $this->postJson('/api/customer/booking-requests', [
            'vehicle_id' => $vehicle->id,
            'pickup_at' => '2030-01-10 10:00',
            'return_at' => '2030-01-12 10:00',
            'payment_method' => 'cash_on_delivery',
            'delivery_address' => '123 Main Street',
            'rental_amount' => 1,
            'total_amount' => 1,
            'status' => 'confirmed',
            'payment_status' => 'paid',
        ])->assertCreated();

        $response->assertJsonPath('customer_id', $customer->id)
            ->assertJsonPath('status', 'pending')
            ->assertJsonPath('payment_status', 'unpaid')
            ->assertJsonPath('payment_method', 'cash_on_delivery')
            ->assertJsonPath('rental_amount', '4000.00')
            ->assertJsonPath('total_amount', '4000.00');
    }

    public function test_customer_requests_allow_destination_for_pickup_and_require_address_for_delivery(): void
    {
        $user = User::factory()->create(['role' => 'customer']);
        $customer = $user->customer()->create(['name' => 'Customer', 'phone' => '09170000000']);
        $otherCustomer = Customer::create(['name' => 'Other', 'phone' => '09170000001']);
        $vehicle = Vehicle::create(['brand' => 'Toyota', 'model' => 'Vios', 'type' => 'car', 'plate_number' => 'CUS-456', 'daily_rate' => 2000, 'status' => 'available']);
        $booking = Booking::create([
            'reference' => 'CLCH-2030-000001', 'customer_id' => $otherCustomer->id, 'vehicle_id' => $vehicle->id,
            'pickup_at' => '2030-02-10 10:00', 'return_at' => '2030-02-11 10:00',
            'status' => 'pending', 'payment_status' => 'unpaid', 'rental_amount' => 2000, 'total_amount' => 2000,
        ]);
        Sanctum::actingAs($user);

        $this->postJson('/api/customer/booking-requests', [
            'vehicle_id' => $vehicle->id, 'pickup_at' => '2030-03-10 10:00', 'return_at' => '2030-03-11 10:00',
            'destination' => 'Airport', 'payment_method' => 'cash_on_pickup',
        ])->assertCreated()->assertJsonPath('destination', 'Airport');
        $this->postJson('/api/customer/booking-requests', [
            'vehicle_id' => $vehicle->id, 'pickup_at' => '2030-04-10 10:00', 'return_at' => '2030-04-11 10:00',
            'payment_method' => 'cash_on_delivery',
        ])->assertUnprocessable()->assertJsonValidationErrors('delivery_address');
        $this->getJson('/api/customer/booking-requests')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson("/api/customer/booking-requests/{$booking->id}")->assertNotFound();
    }

    public function test_customer_booking_keeps_a_twenty_five_hour_rental_within_the_default_grace_period(): void
    {
        $user = User::factory()->create(['role' => 'customer']);
        $user->customer()->create(['name' => 'Customer', 'phone' => '09170000000']);
        $vehicle = Vehicle::create(['brand' => 'Toyota', 'model' => 'Vios', 'type' => 'car', 'plate_number' => 'CUS-789', 'daily_rate' => 2000, 'status' => 'available']);
        Sanctum::actingAs($user);

        $this->postJson('/api/customer/booking-requests', [
            'vehicle_id' => $vehicle->id,
            'pickup_at' => '2030-05-10 09:00',
            'return_at' => '2030-05-11 10:00',
            'payment_method' => 'cash_on_pickup',
        ])->assertCreated()
            ->assertJsonPath('rental_amount', '2000.00')
            ->assertJsonPath('extension_fees', '0.00')
            ->assertJsonPath('total_amount', '2000.00');
    }

    public function test_customer_booking_applies_the_late_return_grace_period_before_billing_extension(): void
    {
        $user = User::factory()->create(['role' => 'customer']);
        $user->customer()->create(['name' => 'Customer', 'phone' => '09170000000']);
        $vehicle = Vehicle::create(['brand' => 'Toyota', 'model' => 'Vios', 'type' => 'car', 'plate_number' => 'CUS-790', 'daily_rate' => 2000, 'status' => 'available']);
        Sanctum::actingAs($user);

        $this->postJson('/api/customer/booking-requests', [
            'vehicle_id' => $vehicle->id,
            'pickup_at' => '2030-06-10 09:00',
            'return_at' => '2030-06-11 10:00',
            'payment_method' => 'cash_on_pickup',
        ])->assertCreated()
            ->assertJsonPath('rental_amount', '2000.00')
            ->assertJsonPath('extension_fees', '0.00')
            ->assertJsonPath('total_amount', '2000.00');

        $this->postJson('/api/customer/booking-requests', [
            'vehicle_id' => $vehicle->id,
            'pickup_at' => '2030-07-10 09:00',
            'return_at' => '2030-07-11 10:01',
            'payment_method' => 'cash_on_pickup',
        ])->assertCreated()
            ->assertJsonPath('extension_fees', '200.00');

        $this->postJson('/api/customer/booking-requests', [
            'vehicle_id' => $vehicle->id,
            'pickup_at' => '2030-08-10 09:00',
            'return_at' => '2030-08-11 11:01',
            'payment_method' => 'cash_on_pickup',
        ])->assertCreated()
            ->assertJsonPath('extension_fees', '400.00');
    }
}
