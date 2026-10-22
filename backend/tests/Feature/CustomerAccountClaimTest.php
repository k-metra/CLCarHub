<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class CustomerAccountClaimTest extends TestCase
{
    use RefreshDatabase;

    public function test_registration_claims_matching_unlinked_profile_and_preserves_onboarding_requirement(): void
    {
        Notification::fake();
        $profile = Customer::create([
            'name' => 'Existing Customer',
            'email' => 'Customer@Example.com',
            'phone' => '09170000000',
        ]);

        $this->postJson('/api/auth/register', [
            'username' => 'existing-customer',
            'email' => 'customer@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ])->assertCreated();

        $user = User::where('email', 'customer@example.com')->firstOrFail();
        $this->assertDatabaseHas('customers', [
            'id' => $profile->id,
            'user_id' => $user->id,
            'email' => 'Customer@Example.com',
            'onboarding_completed_at' => null,
        ]);
        $this->assertDatabaseCount('customers', 1);
    }

    public function test_registration_does_not_claim_a_profile_with_a_different_email(): void
    {
        Notification::fake();
        $profile = Customer::create([
            'name' => 'Existing Customer',
            'email' => 'other@example.com',
        ]);

        $this->postJson('/api/auth/register', [
            'username' => 'new-customer',
            'email' => 'new@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
        ])->assertCreated();

        $this->assertDatabaseHas('customers', ['id' => $profile->id, 'user_id' => null]);
        $this->assertDatabaseCount('customers', 2);
    }
}
