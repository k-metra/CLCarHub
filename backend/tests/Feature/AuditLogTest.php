<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\User;
use App\Models\Vehicle;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AuditLogTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_authorized_staff_can_view_audit_logs(): void
    {
        $owner = User::factory()->create(['role' => 'owner']);
        $customer = User::factory()->create(['role' => 'customer']);

        Sanctum::actingAs($customer);
        $this->getJson('/api/audit-logs')->assertForbidden();

        Sanctum::actingAs($owner);
        $this->getJson('/api/audit-logs')->assertOk();
    }

    public function test_audit_logs_can_be_filtered_searched_sorted_and_paginated(): void
    {
        $owner = User::factory()->create(['role' => 'owner']);
        $actor = User::factory()->create(['name' => 'Maria Santos', 'email' => 'maria@example.com', 'role' => 'staff']);
        AuditLog::query()->delete();

        AuditLog::create([
            'user_id' => $actor->id,
            'category' => 'account',
            'action' => 'login',
            'description' => 'User logged in: Maria Santos',
            'created_at' => now()->subMinutes(3),
        ]);
        AuditLog::create([
            'user_id' => $actor->id,
            'category' => 'dashboard',
            'action' => 'updated',
            'description' => 'Vehicle updated: Toyota Vios',
            'created_at' => now()->subMinutes(2),
        ]);
        AuditLog::create([
            'category' => 'dashboard',
            'action' => 'deleted',
            'description' => 'Vehicle deleted: Honda City',
            'created_at' => now()->subMinute(),
        ]);

        Sanctum::actingAs($owner);
        $response = $this->getJson('/api/audit-logs?category=dashboard&search=Maria&sort=oldest&per_page=10');

        $response->assertOk()
            ->assertJsonPath('total', 1)
            ->assertJsonPath('data.0.action', 'updated')
            ->assertJsonPath('data.0.user.name', 'Maria Santos');
    }

    public function test_model_mutations_create_auditable_dashboard_records(): void
    {
        $owner = User::factory()->create(['role' => 'owner']);
        AuditLog::query()->delete();
        Sanctum::actingAs($owner);

        $vehicle = Vehicle::create([
            'brand' => 'Toyota',
            'model' => 'Vios',
            'type' => 'sedan',
            'plate_number' => 'AUD-123',
            'daily_rate' => 2000,
            'status' => 'available',
        ]);

        $this->assertDatabaseHas('audit_logs', [
            'category' => 'dashboard',
            'action' => 'created',
            'auditable_type' => Vehicle::class,
            'auditable_id' => $vehicle->id,
        ]);
    }
}
