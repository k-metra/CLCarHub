<?php

namespace Tests\Feature;

use App\Models\Partner;
use App\Models\Booking;
use App\Models\Customer;
use App\Models\User;
use App\Models\Vehicle;
use App\Http\Controllers\Api\BookingController;
use App\Notifications\HostInvitationNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

class HostPartnershipTest extends TestCase
{
    use RefreshDatabase;

    public function test_active_host_can_update_only_their_vehicle_status_and_the_change_is_audited(): void
    {
        $host = User::factory()->create(['role' => 'host', 'status' => 'active']);
        $otherHost = User::factory()->create(['role' => 'host', 'status' => 'active']);
        $partner = Partner::create([
            'name' => 'Status Partner',
            'email' => $host->email,
            'contact_number' => '09170000011',
            'address' => 'Manila',
            'commission_based_on' => 'base_rent_only',
            'commission_type' => 'percentage',
            'commission_value' => 20,
            'user_id' => $host->id,
            'host_access_status' => 'active',
        ]);
        $otherPartner = Partner::create([
            'name' => 'Other Partner',
            'email' => $otherHost->email,
            'contact_number' => '09170000012',
            'address' => 'Manila',
            'commission_based_on' => 'base_rent_only',
            'commission_type' => 'percentage',
            'commission_value' => 20,
            'user_id' => $otherHost->id,
            'host_access_status' => 'active',
        ]);
        $vehicle = Vehicle::create([
            'brand' => 'Toyota',
            'model' => 'Vios',
            'type' => 'sedan',
            'plate_number' => 'STA-123',
            'daily_rate' => 2000,
            'status' => 'available',
            'partner_id' => $partner->id,
        ]);
        $otherVehicle = Vehicle::create([
            'brand' => 'Honda',
            'model' => 'City',
            'type' => 'sedan',
            'plate_number' => 'OTH-123',
            'daily_rate' => 2000,
            'status' => 'available',
            'partner_id' => $otherPartner->id,
        ]);

        $this->actingAs($host)
            ->patchJson("/api/host/vehicles/{$vehicle->id}/status", ['status' => 'maintenance'])
            ->assertOk()
            ->assertJsonPath('status', 'maintenance');

        $this->assertDatabaseHas('vehicles', ['id' => $vehicle->id, 'status' => 'maintenance']);
        $this->assertDatabaseHas('audit_logs', [
            'user_id' => $host->id,
            'auditable_type' => Vehicle::class,
            'auditable_id' => $vehicle->id,
            'action' => 'updated',
        ]);

        $this->actingAs($host)
            ->patchJson("/api/host/vehicles/{$otherVehicle->id}/status", ['status' => 'unavailable'])
            ->assertNotFound();

        $this->assertDatabaseHas('vehicles', ['id' => $otherVehicle->id, 'status' => 'available']);
    }

    public function test_total_booking_amount_partner_share_excludes_cash_security_deposit(): void
    {
        $partner = Partner::create([
            'name' => 'Commission Partner',
            'email' => 'commission@example.com',
            'contact_number' => '09170000010',
            'address' => 'Manila',
            'commission_based_on' => 'total_booking_amount',
            'commission_type' => 'percentage',
            'commission_value' => 40,
        ]);
        $vehicle = Vehicle::create([
            'brand' => 'Toyota',
            'model' => 'Vios',
            'type' => 'sedan',
            'plate_number' => 'COM-123',
            'daily_rate' => 1600,
            'status' => 'available',
            'partner_id' => $partner->id,
        ]);
        $customer = Customer::create(['name' => 'Customer', 'phone' => '09170000010']);
        $booking = Booking::create([
            'reference' => 'CLCH-2030-010010',
            'customer_id' => $customer->id,
            'vehicle_id' => $vehicle->id,
            'pickup_at' => '2030-01-10 10:00',
            'return_at' => '2030-01-11 10:00',
            'status' => Booking::COMPLETE,
            'payment_status' => 'paid',
            'rental_amount' => 1600,
            'deposit' => 2500,
            'total_amount' => 4100,
        ]);

        $method = new \ReflectionMethod(BookingController::class, 'createPartnerEarning');
        $method->invoke(new BookingController, $booking);

        $this->assertDatabaseHas('partner_earnings', [
            'booking_id' => $booking->id,
            'gross_amount' => 1600,
            'net_amount' => 640,
            'commission_amount' => 960,
        ]);
    }

    public function test_admin_can_provision_and_activate_a_host_without_a_duplicate_partner(): void
    {
        $admin = User::factory()->create(['role' => 'owner', 'status' => 'active']);
        $partner = Partner::create([
            'name' => 'Northwind Fleet',
            'email' => 'host@example.com',
            'contact_number' => '09170000000',
            'address' => 'Manila',
            'commission_based_on' => 'base_rent_only',
            'commission_type' => 'percentage',
            'commission_value' => 20,
        ]);

        $response = $this->actingAs($admin)->postJson("/api/partners/{$partner->id}/provision", [
            'email' => 'host@example.com',
            'name' => 'Northwind Fleet Host',
        ]);

        $response->assertOk()->assertJsonStructure(['partner', 'activation_token']);
        $token = $response->json('activation_token');
        $this->assertSame(1, Partner::count());
        $this->assertDatabaseHas('partners', ['id' => $partner->id, 'host_access_status' => 'pending_activation']);

        $this->postJson('/api/auth/host/activate', [
            'token' => $token,
            'password' => 'secure-password',
            'password_confirmation' => 'secure-password',
        ])->assertOk();

        $this->assertDatabaseHas('partners', ['id' => $partner->id, 'host_access_status' => 'active']);
        $host = User::where('email', 'host@example.com')->firstOrFail();
        $this->assertSame('host', $host->role);
        $this->assertTrue($host->hasVerifiedEmail());
    }

    public function test_host_dashboard_requires_active_linked_access(): void
    {
        $host = User::factory()->create(['role' => 'host', 'status' => 'active']);

        $this->actingAs($host)
            ->getJson('/api/host/dashboard')
            ->assertForbidden();
    }

    public function test_admin_can_upload_contract_documents_and_active_host_can_view_them(): void
    {
        Storage::fake('public');
        $admin = User::factory()->create(['role' => 'owner', 'status' => 'active']);
        $host = User::factory()->create(['role' => 'host', 'status' => 'active']);
        $partner = Partner::create([
            'name' => 'Document Partner',
            'email' => $host->email,
            'contact_number' => '09170000009',
            'address' => 'Manila',
            'commission_based_on' => 'base_rent_only',
            'commission_type' => 'percentage',
            'commission_value' => 20,
            'user_id' => $host->id,
            'host_access_status' => 'active',
        ]);

        $response = $this->actingAs($admin)->post("/api/partners/{$partner->id}/contract-documents", [
            'files' => [
                UploadedFile::fake()->create('signed-contract.png', 100, 'image/png'),
                UploadedFile::fake()->create('terms.pdf', 100, 'application/pdf'),
            ],
        ]);

        $response->assertOk()->assertJsonCount(2, 'contract_documents');
        $this->assertDatabaseCount('partner_contract_documents', 2);

        $this->actingAs($host)
            ->getJson('/api/host/dashboard')
            ->assertOk()
            ->assertJsonCount(2, 'partner.contract_documents');
    }

    public function test_admin_can_reactivate_revoked_host_access(): void
    {
        $admin = User::factory()->create(['role' => 'owner', 'status' => 'active']);
        $host = User::factory()->create(['role' => 'host', 'status' => 'suspended']);
        $partner = Partner::create([
            'name' => 'Revoked Partner',
            'email' => 'revoked@example.com',
            'contact_number' => '09170000001',
            'address' => 'Manila',
            'commission_based_on' => 'base_rent_only',
            'commission_type' => 'percentage',
            'commission_value' => 20,
            'user_id' => $host->id,
            'host_access_status' => 'revoked',
            'host_access_revoked_at' => now(),
        ]);

        $this->actingAs($admin)
            ->postJson("/api/partners/{$partner->id}/reactivate-access")
            ->assertOk()
            ->assertJsonPath('host_access_status', 'active');

        $this->assertDatabaseHas('users', ['id' => $host->id, 'role' => 'host', 'status' => 'active']);
        $this->assertDatabaseHas('partners', ['id' => $partner->id, 'host_access_status' => 'active', 'host_access_revoked_at' => null]);
    }

    public function test_admin_can_send_a_host_invitation_notification(): void
    {
        Notification::fake();
        $admin = User::factory()->create(['role' => 'owner', 'status' => 'active']);
        $host = User::factory()->create(['role' => 'host', 'status' => 'active']);
        $partner = Partner::create([
            'name' => 'Invitation Partner',
            'email' => $host->email,
            'contact_number' => '09170000002',
            'address' => 'Manila',
            'commission_based_on' => 'base_rent_only',
            'commission_type' => 'percentage',
            'commission_value' => 20,
            'user_id' => $host->id,
            'host_access_status' => 'pending_activation',
        ]);

        $this->actingAs($admin)
            ->postJson("/api/partners/{$partner->id}/send-invitation")
            ->assertOk()
            ->assertJson(['message' => 'The host invitation email has been sent.']);

        Notification::assertSentTo($host, HostInvitationNotification::class);
        $this->assertDatabaseHas('host_activation_tokens', ['user_id' => $host->id]);
    }

    public function test_revoking_pending_activation_cancels_provisioning_and_invalidates_tokens(): void
    {
        $admin = User::factory()->create(['role' => 'owner', 'status' => 'active']);
        $host = User::factory()->create(['role' => 'host', 'status' => 'active']);
        $partner = Partner::create([
            'name' => 'Pending Partner',
            'email' => $host->email,
            'contact_number' => '09170000003',
            'address' => 'Manila',
            'commission_based_on' => 'base_rent_only',
            'commission_type' => 'percentage',
            'commission_value' => 20,
            'user_id' => $host->id,
            'host_access_status' => 'pending_activation',
        ]);
        $token = \App\Models\HostActivationToken::create([
            'user_id' => $host->id,
            'token_hash' => hash('sha256', 'pending-token'),
            'expires_at' => now()->addDays(7),
        ]);

        $this->actingAs($admin)
            ->postJson("/api/partners/{$partner->id}/revoke-access")
            ->assertOk()
            ->assertJsonPath('host_access_status', 'not_provisioned');

        $this->assertDatabaseHas('partners', ['id' => $partner->id, 'user_id' => null, 'host_access_status' => 'not_provisioned']);
        $this->assertDatabaseHas('host_activation_tokens', ['id' => $token->id]);
        $this->assertNotNull($token->fresh()->used_at);
    }
}
