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

    private function authenticate(): array
    {
        $owner = User::factory()->create(['role' => 'owner']);
        $vehicle = Vehicle::create(['brand' => 'Toyota', 'model' => 'Corolla', 'type' => 'car', 'plate_number' => 'ABC-123', 'daily_rate' => 2000, 'status' => 'available']);
        $customer = Customer::create(['name' => 'First Customer', 'phone' => '09170000000']);
        Sanctum::actingAs($owner);

        return [$vehicle, $customer];
    }

    public function test_booking_rejects_an_overlapping_active_period(): void
    {
        [$vehicle, $customer] = $this->authenticate();
        $otherCustomer = Customer::create(['name' => 'Second Customer', 'phone' => '09170000001']);

        $this->postJson('/api/bookings', ['customer_id' => $customer->id, 'vehicle_id' => $vehicle->id, 'pickup_at' => '2030-01-10 10:00', 'return_at' => '2030-01-12 10:00'])->assertCreated();

        $this->postJson('/api/bookings', ['customer_id' => $otherCustomer->id, 'vehicle_id' => $vehicle->id, 'pickup_at' => '2030-01-11 14:00', 'return_at' => '2030-01-13 10:00'])->assertUnprocessable();
        $this->assertCount(1, Booking::all());
    }

    public function test_vehicle_availability_returns_conflicting_intervals_without_customer_details(): void
    {
        [$vehicle, $customer] = $this->authenticate();
        Booking::create([
            'reference' => 'CLCH-2030-000001',
            'customer_id' => $customer->id,
            'vehicle_id' => $vehicle->id,
            'pickup_at' => '2030-01-10 10:00',
            'return_at' => '2030-01-12 10:00',
            'status' => 'confirmed',
            'payment_status' => 'unpaid',
            'rental_amount' => 4000,
            'total_amount' => 4000,
        ]);

        $this->getJson("/api/vehicles/{$vehicle->id}/availability?pickup_at=2030-01-11%2010:00&return_at=2030-01-13%2010:00")
            ->assertOk()
            ->assertJsonPath('available', false)
            ->assertJsonPath('conflicts.0.pickup_at', '2030-01-10T02:00:00.000000Z')
            ->assertJsonPath('conflicts.0.return_at', '2030-01-12T02:00:00.000000Z')
            ->assertJsonMissingPath('conflicts.0.customer_id')
            ->assertJsonMissingPath('conflicts.0.customer');
    }

    public function test_exactly_twenty_four_hours_costs_one_rental_day(): void
    {
        [$vehicle, $customer] = $this->authenticate();

        $response = $this->postJson('/api/bookings', [
            'customer_id' => $customer->id,
            'vehicle_id' => $vehicle->id,
            'pickup_at' => '2030-01-10 10:00',
            'return_at' => '2030-01-11 10:00',
        ])->assertCreated();

        $this->assertSame('2000.00', $response->json('rental_amount'));
        $this->assertSame('2000.00', $response->json('total_amount'));
    }

    public function test_cancelled_and_rejected_bookings_do_not_block_a_vehicle(): void
    {
        [$vehicle, $customer] = $this->authenticate();

        foreach (['cancelled', 'rejected'] as $status) {
            $this->postJson('/api/bookings', [
                'customer_id' => $customer->id,
                'vehicle_id' => $vehicle->id,
                'pickup_at' => '2030-01-10 10:00',
                'return_at' => '2030-01-11 10:00',
                'status' => $status,
            ])->assertCreated();
        }

        $this->assertCount(2, Booking::all());
    }

    public function test_balance_is_derived_from_total_amount_and_payments(): void
    {
        [$vehicle, $customer] = $this->authenticate();

        $response = $this->postJson('/api/bookings', [
            'customer_id' => $customer->id,
            'vehicle_id' => $vehicle->id,
            'pickup_at' => '2030-01-10 10:00',
            'return_at' => '2030-01-11 10:00',
            'payments' => [
                ['amount' => 500, 'paid_at' => '2030-01-10', 'notes' => 'Deposit'],
            ],
        ])->assertCreated();

        $this->assertEquals(1500.0, $response->json('balance'));
        $this->assertSame(1500.0, Booking::firstOrFail()->balance);
    }

    public function test_status_transitions_follow_the_booking_lifecycle(): void
    {
        [$vehicle, $customer] = $this->authenticate();

        $booking = $this->postJson('/api/bookings', [
            'customer_id' => $customer->id,
            'vehicle_id' => $vehicle->id,
            'pickup_at' => '2030-01-10 10:00',
            'return_at' => '2030-01-11 10:00',
        ])->assertCreated()->json();

        $this->patchJson("/api/bookings/{$booking['id']}", ['status' => 'confirmed'])->assertOk();
        $this->patchJson("/api/bookings/{$booking['id']}", ['status' => 'active'])->assertOk();
        $this->patchJson("/api/bookings/{$booking['id']}", ['status' => 'completed'])->assertOk();
        $this->patchJson("/api/bookings/{$booking['id']}", ['status' => 'pending'])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'A completed booking cannot be changed to pending.');
    }

    public function test_pending_booking_cannot_become_active_directly(): void
    {
        [$vehicle, $customer] = $this->authenticate();

        $booking = $this->postJson('/api/bookings', [
            'customer_id' => $customer->id,
            'vehicle_id' => $vehicle->id,
            'pickup_at' => '2030-01-10 10:00',
            'return_at' => '2030-01-11 10:00',
        ])->assertCreated()->json();

        $this->patchJson("/api/bookings/{$booking['id']}", ['status' => 'active'])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'A pending booking cannot be changed to active.');
    }

    public function test_terminal_status_change_requires_a_reason_and_records_history(): void
    {
        [$vehicle, $customer] = $this->authenticate();

        $booking = $this->postJson('/api/bookings', [
            'customer_id' => $customer->id,
            'vehicle_id' => $vehicle->id,
            'pickup_at' => '2030-01-10 10:00',
            'return_at' => '2030-01-11 10:00',
        ])->assertCreated()->json();

        $this->patchJson("/api/bookings/{$booking['id']}", ['status' => 'cancelled'])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'A reason is required when cancelling or rejecting a booking.');

        $this->patchJson("/api/bookings/{$booking['id']}", ['status' => 'cancelled', 'status_reason' => 'Customer cancelled the reservation.'])
            ->assertOk()
            ->assertJsonPath('status_history.0.to_status', 'cancelled')
            ->assertJsonPath('status_history.0.reason', 'Customer cancelled the reservation.');
    }
}
