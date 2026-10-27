<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Customer;
use App\Models\FleetSetting;
use App\Models\IpBlock;
use App\Models\User;
use App\Models\Vehicle;
use App\Models\SocialAccount;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;
use App\Services\CustomerBookingSmsService;

class CustomerBookingRequestTest extends TestCase
{
    use DatabaseTruncation;

    protected function setUp(): void
    {
        parent::setUp();
        IpBlock::query()->delete();
        FleetSetting::firstOrCreate(['id' => 1], [
            'reservation_fee' => 0,
            'reservation_fee_deductible' => true,
        ]);
    }

    public function test_customer_booking_sms_includes_customer_name_and_pickup_schedule(): void
    {
        Http::fake();
        config()->set('services.sms_gateway.url', 'https://sms.example.test/send');
        config()->set('services.sms_gateway.token', 'test-token');
        FleetSetting::query()->firstOrFail()->update(['booking_sms_numbers' => ['+639939928496']]);

        $customer = Customer::create(['name' => 'Maria Santos', 'phone' => '09170000000']);
        $vehicle = Vehicle::create([
            'brand' => 'Toyota',
            'model' => 'Vios',
            'type' => 'sedan',
            'plate_number' => 'SMS-123',
            'daily_rate' => 2000,
            'status' => 'available',
        ]);
        $booking = Booking::create([
            'reference' => 'CLCH-2030-000001',
            'customer_id' => $customer->id,
            'vehicle_id' => $vehicle->id,
            'pickup_at' => '2030-01-10 10:00',
            'return_at' => '2030-01-11 10:00',
            'status' => Booking::PENDING,
            'payment_status' => 'unpaid',
            'rental_amount' => 2000,
            'total_amount' => 2000,
        ]);

        app(CustomerBookingSmsService::class)->send($booking);

        Http::assertSent(fn ($request): bool =>
            str_contains($request['message'], 'Maria Santos')
            && str_contains($request['message'], 'Jan 10, 2030 10:00 AM')
        );
    }

    public function test_customer_with_booking_history_is_archived_and_can_be_restored(): void
    {
        $user = User::factory()->create(['role' => 'customer']);
        $customer = $user->customer()->create(['name' => 'Customer', 'phone' => '09170000000', 'social_profile_url' => 'https://instagram.com/customer']);
        $vehicle = Vehicle::create(['brand' => 'Toyota', 'model' => 'Vios', 'type' => 'sedan', 'plate_number' => 'ARC-123', 'daily_rate' => 2000, 'status' => 'available']);
        Booking::create([
            'reference' => 'CLCH-2030-009999', 'customer_id' => $customer->id, 'vehicle_id' => $vehicle->id,
            'pickup_at' => '2030-01-10 10:00', 'return_at' => '2030-01-11 10:00',
            'status' => Booking::COMPLETE, 'payment_status' => 'unpaid', 'rental_amount' => 2000, 'total_amount' => 2000,
        ]);
        $staff = User::factory()->create(['role' => 'owner']);
        Sanctum::actingAs($staff);

        $this->deleteJson("/api/customers/{$customer->id}")->assertNoContent();
        $this->assertDatabaseHas('customers', ['id' => $customer->id]);
        $this->getJson('/api/customers')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/customers?include_archived=1')->assertOk()->assertJsonCount(1, 'data');
        $this->postJson("/api/customers/{$customer->id}/restore")->assertOk();
        $this->getJson('/api/customers')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_archived_customer_bookings_are_hidden_from_admin_booking_list_by_default(): void
    {
        $customer = Customer::create(['name' => 'Archived', 'phone' => '09170000000', 'archived_at' => now()]);
        $vehicle = Vehicle::create(['brand' => 'Toyota', 'model' => 'Vios', 'type' => 'sedan', 'plate_number' => 'ARC-124', 'daily_rate' => 2000, 'status' => 'available']);
        Booking::create([
            'reference' => 'CLCH-2030-009998', 'customer_id' => $customer->id, 'vehicle_id' => $vehicle->id,
            'pickup_at' => '2030-01-10 10:00', 'return_at' => '2030-01-11 10:00',
            'status' => Booking::CANCELLED, 'payment_status' => 'unpaid', 'rental_amount' => 2000, 'total_amount' => 2000,
        ]);
        $staff = User::factory()->create(['role' => 'owner']);
        Sanctum::actingAs($staff);

        $this->getJson('/api/bookings')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/bookings?include_archived=1')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_booking_only_ip_blocks_prevent_booking_submission_but_not_customer_listing(): void
    {
        $user = User::factory()->create(['role' => 'customer', 'last_login_ip' => '203.0.113.10']);
        $user->customer()->create(['name' => 'Customer', 'phone' => '09170000000', 'social_profile_url' => 'https://instagram.com/customer']);
        Sanctum::actingAs($user);

        $this->getJson('/api/customer/booking-requests')->assertOk();
        IpBlock::create(['ip_address' => '::1', 'scope' => 'bookings']);
        $this->withServerVariables(['REMOTE_ADDR' => '::1'])
            ->postJson('/api/customer/booking-requests', [])
            ->assertForbidden();
    }

    public function test_all_access_ip_blocks_prevent_api_access(): void
    {
        $user = User::factory()->create(['role' => 'customer']);
        $user->customer()->create(['name' => 'Customer', 'phone' => '09170000000', 'social_profile_url' => 'https://instagram.com/customer']);
        IpBlock::create(['ip_address' => '::1', 'scope' => 'all']);
        Sanctum::actingAs($user);

        $this->withServerVariables(['REMOTE_ADDR' => '::1'])
            ->getJson('/api/auth/user')
            ->assertForbidden();
    }

    public function test_customer_booking_submissions_are_rate_limited_by_ip(): void
    {
        $user = User::factory()->create(['role' => 'customer']);
        $user->customer()->create(['name' => 'Customer', 'phone' => '09170000000', 'social_profile_url' => 'https://instagram.com/customer']);
        Sanctum::actingAs($user);

        $request = $this->withServerVariables(['REMOTE_ADDR' => '::1']);
        foreach (range(1, 5) as $attempt) {
            $request->postJson('/api/customer/booking-requests', [])
                ->assertUnprocessable();
        }

        $request->postJson('/api/customer/booking-requests', [])
            ->assertTooManyRequests();
    }

    public function test_customer_attachment_limits_allow_four_ltms_two_secondary_ids_and_one_selfie(): void
    {
        Storage::fake('public');
        $user = User::factory()->create(['role' => 'customer']);
        $customer = $user->customer()->create(['name' => 'Customer', 'phone' => '09170000000', 'social_profile_url' => 'https://instagram.com/customer']);
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

    public function test_customer_booking_requires_an_active_social_profile_link(): void
    {
        $user = User::factory()->create(['role' => 'customer']);
        $customer = $user->customer()->create(['name' => 'Customer', 'phone' => '09170000000']);
        $vehicle = Vehicle::create(['brand' => 'Toyota', 'model' => 'Vios', 'type' => 'sedan', 'plate_number' => 'CUS-SOCIAL', 'daily_rate' => 2000, 'status' => 'available']);
        Sanctum::actingAs($user);

        $this->postJson('/api/customer/booking-requests', [
            'vehicle_id' => $vehicle->id,
            'pickup_at' => '2030-01-10 10:00',
            'return_at' => '2030-01-11 10:00',
            'payment_method' => 'cash_on_pickup',
        ])->assertUnprocessable()
            ->assertJsonPath('message', 'Add a link to one of your active social profiles before booking.');

        $this->assertDatabaseMissing('bookings', ['customer_id' => $customer->id]);
    }

    public function test_customer_booking_persists_social_profile_submitted_with_booking(): void
    {
        $user = User::factory()->create(['role' => 'customer']);
        $customer = $user->customer()->create(['name' => 'Customer', 'phone' => '09170000000']);
        $vehicle = Vehicle::create(['brand' => 'Toyota', 'model' => 'Vios', 'type' => 'sedan', 'plate_number' => 'CUS-SOCIAL-BOOKING', 'daily_rate' => 2000, 'status' => 'available']);
        Sanctum::actingAs($user);

        $this->postJson('/api/customer/booking-requests', [
            'vehicle_id' => $vehicle->id,
            'pickup_at' => '2030-01-10 10:00',
            'return_at' => '2030-01-11 10:00',
            'social_profile_url' => 'https://instagram.com/customer',
            'payment_method' => 'cash_on_pickup',
        ])->assertCreated();

        $this->assertDatabaseHas('customers', [
            'id' => $customer->id,
            'social_profile_url' => 'https://instagram.com/customer',
        ]);
    }

    public function test_customer_booking_rejects_pickup_dates_before_today(): void
    {
        $user = User::factory()->create(['role' => 'customer']);
        $customer = $user->customer()->create([
            'name' => 'Customer',
            'phone' => '09170000000',
            'social_profile_url' => 'https://instagram.com/customer',
        ]);
        $vehicle = Vehicle::create([
            'brand' => 'Toyota',
            'model' => 'Vios',
            'type' => 'sedan',
            'plate_number' => 'CUS-DATE',
            'daily_rate' => 2000,
            'status' => 'available',
        ]);
        Sanctum::actingAs($user);

        $this->postJson('/api/customer/booking-requests', [
            'vehicle_id' => $vehicle->id,
            'pickup_at' => now()->subDay()->format('Y-m-d H:i:s'),
            'return_at' => now()->addDay()->format('Y-m-d H:i:s'),
            'payment_method' => 'cash_on_pickup',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['pickup_at']);

        $this->assertDatabaseMissing('bookings', ['customer_id' => $customer->id]);
    }

    public function test_facebook_connected_customer_can_book_without_a_profile_url(): void
    {
        $user = User::factory()->create(['role' => 'customer']);
        $customer = $user->customer()->create(['name' => 'Customer', 'phone' => '09170000000']);
        SocialAccount::create([
            'user_id' => $user->id,
            'provider' => 'facebook',
            'provider_user_id' => 'facebook-customer-1',
        ]);
        $vehicle = Vehicle::create(['brand' => 'Toyota', 'model' => 'Vios', 'type' => 'sedan', 'plate_number' => 'CUS-FB', 'daily_rate' => 2000, 'status' => 'available']);
        Sanctum::actingAs($user);

        $this->postJson('/api/customer/booking-requests', [
            'vehicle_id' => $vehicle->id,
            'pickup_at' => '2030-01-10 10:00',
            'return_at' => '2030-01-11 10:00',
            'payment_method' => 'cash_on_pickup',
        ])->assertCreated()
            ->assertJsonPath('customer_id', $customer->id);
    }

    public function test_staff_customer_profile_includes_facebook_account_for_background_checks(): void
    {
        $staff = User::factory()->create(['role' => 'owner']);
        $customerUser = User::factory()->create(['role' => 'customer']);
        $customer = $customerUser->customer()->create(['name' => 'Customer']);
        SocialAccount::create([
            'user_id' => $customerUser->id,
            'provider' => 'facebook',
            'provider_user_id' => 'facebook-customer-2',
            'provider_profile_url' => 'https://www.facebook.com/facebook-customer-2',
        ]);
        Sanctum::actingAs($staff);

        $this->getJson("/api/customers/{$customer->id}")
            ->assertOk()
            ->assertJsonPath('user.social_accounts.0.provider', 'facebook')
            ->assertJsonPath('user.social_accounts.0.provider_user_id', 'facebook-customer-2')
            ->assertJsonPath('user.social_accounts.0.provider_profile_url', 'https://www.facebook.com/facebook-customer-2');
    }

    public function test_unpaid_pending_booking_does_not_block_a_paid_booking_but_cannot_later_be_paid_if_dates_conflict(): void
    {
        $customerAUser = User::factory()->create(['role' => 'customer']);
        $customerA = $customerAUser->customer()->create([
            'name' => 'Customer A',
            'social_profile_url' => 'https://instagram.com/customer-a',
        ]);
        $customerB = Customer::create(['name' => 'Customer B']);
        $vehicle = Vehicle::create([
            'brand' => 'Honda',
            'model' => 'CB650-R',
            'type' => 'motorcycle',
            'plate_number' => 'CB-650',
            'daily_rate' => 2000,
            'status' => 'available',
        ]);
        $pendingBooking = Booking::create([
            'reference' => 'CLCH-2030-PENDING',
            'customer_id' => $customerA->id,
            'vehicle_id' => $vehicle->id,
            'pickup_at' => '2030-11-27 10:00',
            'return_at' => '2030-11-30 10:00',
            'status' => Booking::PENDING,
            'payment_status' => 'unpaid',
            'rental_amount' => 6000,
            'total_amount' => 6000,
        ]);
        Booking::create([
            'reference' => 'CLCH-2030-PAID',
            'customer_id' => $customerB->id,
            'vehicle_id' => $vehicle->id,
            'pickup_at' => '2030-11-29 10:00',
            'return_at' => '2030-11-30 10:00',
            'status' => Booking::UPCOMING,
            'payment_status' => 'partial',
            'rental_amount' => 2000,
            'total_amount' => 2000,
        ]);
        Sanctum::actingAs($customerAUser);

        $this->postJson("/api/customer/booking-requests/{$pendingBooking->id}/payment", [
            'amount' => 500,
        ])->assertUnprocessable()
            ->assertJsonPath('message', 'This vehicle has already been reserved by another customer during your selected dates. Please reschedule your booking. To avoid this in the future, pay at least the reservation fee when you submit your booking request.');
    }

    public function test_customer_can_create_a_pending_unpaid_request_without_setting_pricing(): void
    {
        $user = User::factory()->create(['role' => 'customer']);
        $customer = $user->customer()->create(['name' => 'Customer', 'phone' => '09170000000', 'social_profile_url' => 'https://instagram.com/customer']);
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
        $customer = $user->customer()->create(['name' => 'Customer', 'phone' => '09170000000', 'social_profile_url' => 'https://instagram.com/customer']);
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
        $user->customer()->create(['name' => 'Customer', 'phone' => '09170000000', 'social_profile_url' => 'https://instagram.com/customer']);
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
        $user->customer()->create(['name' => 'Customer', 'phone' => '09170000000', 'social_profile_url' => 'https://instagram.com/customer']);
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
        $user->customer()->create(['name' => 'Customer', 'phone' => '09170000000', 'social_profile_url' => 'https://instagram.com/customer']);
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

    public function test_labeled_pinned_locations_still_calculate_delivery_fees(): void
    {
        $user = User::factory()->create(['role' => 'customer']);
        $user->customer()->create(['name' => 'Customer', 'phone' => '09170000000', 'social_profile_url' => 'https://instagram.com/customer']);
        $vehicle = Vehicle::create([
            'brand' => 'Toyota', 'model' => 'Vios', 'type' => 'sedan', 'plate_number' => 'CUS-792',
            'daily_rate' => 2000, 'delivery_rate_per_km' => 50, 'status' => 'available',
        ]);
        FleetSetting::findOrFail(1)->update([
            'default_delivery_rate_per_km' => 25,
            'garage_location_latitude' => 14.5,
            'garage_location_longitude' => 121.0,
        ]);
        Http::fake(['https://router.project-osrm.org/*' => Http::response([
            'code' => 'Ok',
            'routes' => [['distance' => 10000]],
        ])]);
        Sanctum::actingAs($user);

        $this->postJson('/api/customer/booking-requests', [
            'vehicle_id' => $vehicle->id,
            'pickup_at' => '2030-11-10 10:00',
            'return_at' => '2030-11-12 10:00',
            'payment_method' => 'cash_on_delivery',
            'delivery_address' => 'Customer-entered delivery label',
            'delivery_latitude' => 14.6,
            'delivery_longitude' => 121.1,
            'return_address' => 'Customer-entered return label',
            'return_latitude' => 14.7,
            'return_longitude' => 121.2,
        ])->assertCreated()
            ->assertJsonPath('delivery_fee', '500.00')
            ->assertJsonPath('return_pickup_fee', '1000.00')
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
