<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\FleetSetting;
use App\Models\IpBlock;
use App\Models\User;
use App\Models\Vehicle;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CustomerBookingRequestTest extends TestCase
{
    use RefreshDatabase;

    public function test_booking_only_ip_blocks_prevent_booking_submission_but_not_customer_listing(): void
    {
        $user = User::factory()->create(['role' => 'customer', 'last_login_ip' => '203.0.113.10']);
        $user->customer()->create(['name' => 'Customer', 'phone' => '09170000000']);
        IpBlock::create(['ip_address' => '127.0.0.1', 'scope' => 'bookings']);
        Sanctum::actingAs($user);

        $this->getJson('/api/customer/booking-requests')->assertOk();
        $this->postJson('/api/customer/booking-requests', [])->assertForbidden();
    }

    public function test_all_access_ip_blocks_prevent_api_access(): void
    {
        $user = User::factory()->create(['role' => 'customer']);
        $user->customer()->create(['name' => 'Customer', 'phone' => '09170000000']);
        IpBlock::create(['ip_address' => '127.0.0.1', 'scope' => 'all']);
        Sanctum::actingAs($user);

        $this->getJson('/api/auth/user')->assertForbidden();
    }

    public function test_customer_booking_submissions_are_rate_limited_by_ip(): void
    {
        $user = User::factory()->create(['role' => 'customer']);
        $user->customer()->create(['name' => 'Customer', 'phone' => '09170000000']);
        Sanctum::actingAs($user);

        foreach (range(1, 5) as $attempt) {
            $this->postJson('/api/customer/booking-requests', [])
                ->assertUnprocessable();
        }

        $this->postJson('/api/customer/booking-requests', [])
            ->assertTooManyRequests();
    }

    public function test_customer_attachment_limits_allow_four_ltms_two_secondary_ids_and_one_selfie(): void
    {
        Storage::fake('public');
        $user = User::factory()->create(['role' => 'customer']);
        $customer = $user->customer()->create(['name' => 'Customer', 'phone' => '09170000000']);
        Sanctum::actingAs($user);

        $attachments = [];
        foreach (range(1, 4) as $index) {
            $attachments[] = ["category" => "ltms", "file" => UploadedFile::fake()->create("ltms-{$index}.jpg", 100, "image/jpeg")];
        }
        foreach (range(1, 2) as $index) {
            $attachments[] = ["category" => "secondary_id", "file" => UploadedFile::fake()->create("secondary-{$index}.jpg", 100, "image/jpeg")];
        }
        $attachments[] = ["category" => "selfie_license", "file" => UploadedFile::fake()->create("selfie.jpg", 100, "image/jpeg")];

        $this->patch("/api/customers/{$customer->id}", [
            'name' => $customer->name,
            'phone' => $customer->phone,
            'attachments' => $attachments,
        ])->assertOk();

        $this->assertDatabaseCount('customer_attachments', 7);

        $this->patch("/api/customers/{$customer->id}", [
            'name' => $customer->name,
            'phone' => $customer->phone,
            'attachments' => [["category" => "ltms", "file" => UploadedFile::fake()->create('ltms-extra.jpg', 100, 'image/jpeg')]],
        ])->assertUnprocessable();
    }

    public function test_customer_can_create_a_pending_unpaid_request_without_setting_pricing(): void
    {
        $user = User::factory()->create(['role' => 'customer']);
        $customer = $user->customer()->create(['name' => 'Customer', 'phone' => '09170000000']);
        $vehicle = Vehicle::create(['brand' => 'Toyota', 'model' => 'Vios', 'type' => 'sedan', 'plate_number' => 'CUS-123', 'daily_rate' => 2000, 'status' => 'available']);
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
        $vehicle = Vehicle::create(['brand' => 'Toyota', 'model' => 'Vios', 'type' => 'sedan', 'plate_number' => 'CUS-456', 'daily_rate' => 2000, 'status' => 'available']);
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
        $vehicle = Vehicle::create(['brand' => 'Toyota', 'model' => 'Vios', 'type' => 'sedan', 'plate_number' => 'CUS-789', 'daily_rate' => 2000, 'status' => 'available']);
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
        $vehicle = Vehicle::create(['brand' => 'Toyota', 'model' => 'Vios', 'type' => 'sedan', 'plate_number' => 'CUS-790', 'daily_rate' => 2000, 'status' => 'available']);
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

    public function test_customer_booking_calculates_delivery_and_round_trip_return_fees_using_vehicle_rate(): void
    {
        $user = User::factory()->create(['role' => 'customer']);
        $user->customer()->create(['name' => 'Customer', 'phone' => '09170000000']);
        $vehicle = Vehicle::create([
            'brand' => 'Toyota', 'model' => 'Vios', 'type' => 'sedan', 'plate_number' => 'CUS-791',
            'daily_rate' => 2000, 'delivery_rate_per_km' => 50, 'status' => 'available',
        ]);
        FleetSetting::findOrFail(1)->update([
            'default_delivery_rate_per_km' => 25,
            'garage_location_latitude' => 14.5,
            'garage_location_longitude' => 121.0,
        ]);
        Http::fake([
            'https://router.project-osrm.org/*' => Http::response([
                'code' => 'Ok',
                'routes' => [['distance' => 10000]],
            ]),
        ]);
        Sanctum::actingAs($user);

        $this->postJson('/api/customer/booking-requests', [
            'vehicle_id' => $vehicle->id,
            'pickup_at' => '2030-09-10 10:00',
            'return_at' => '2030-09-12 10:00',
            'payment_method' => 'cash_on_delivery',
            'delivery_address' => 'Delivery label',
            'delivery_latitude' => 14.6,
            'delivery_longitude' => 121.1,
            'return_address' => 'Return label',
            'return_latitude' => 14.7,
            'return_longitude' => 121.2,
        ])->assertCreated()
            ->assertJsonPath('delivery_distance_km', '10.00')
            ->assertJsonPath('delivery_rate_per_km', '50.00')
            ->assertJsonPath('delivery_fee', '500.00')
            ->assertJsonPath('return_distance_km', '10.00')
            ->assertJsonPath('return_pickup_fee', '1000.00')
            ->assertJsonPath('rental_amount', '4000.00')
            ->assertJsonPath('total_amount', '5500.00');
    }

    public function test_admin_booking_uses_custom_rental_rate_and_fleet_delivery_rate_fallback(): void
    {
        $user = User::factory()->create(['role' => 'owner']);
        $customer = Customer::create(['name' => 'Customer', 'phone' => '09170000000']);
        $vehicle = Vehicle::create([
            'brand' => 'Toyota', 'model' => 'Vios', 'type' => 'sedan', 'plate_number' => 'ADM-791',
            'daily_rate' => 2000, 'delivery_rate_per_km' => 0, 'status' => 'available',
        ]);
        FleetSetting::findOrFail(1)->update([
            'default_delivery_rate_per_km' => 25,
            'garage_location_latitude' => 14.5,
            'garage_location_longitude' => 121.0,
        ]);
        Http::fake([
            'https://router.project-osrm.org/*' => Http::response([
                'code' => 'Ok',
                'routes' => [['distance' => 10000]],
            ]),
        ]);
        Sanctum::actingAs($user);

        $this->postJson('/api/bookings', [
            'customer_id' => $customer->id,
            'vehicle_id' => $vehicle->id,
            'pickup_at' => '2030-10-10 10:00',
            'return_at' => '2030-10-12 10:00',
            'rental_rate' => 1500,
            'payment_method' => 'cash_on_delivery',
            'delivery_address' => 'Delivery label',
            'delivery_latitude' => 14.6,
            'delivery_longitude' => 121.1,
        ])->assertCreated()
            ->assertJsonPath('rental_rate', '1500.00')
            ->assertJsonPath('rental_amount', '3000.00')
            ->assertJsonPath('delivery_rate_per_km', '25.00')
            ->assertJsonPath('delivery_fee', '250.00')
            ->assertJsonPath('total_amount', '3250.00');
    }
}
