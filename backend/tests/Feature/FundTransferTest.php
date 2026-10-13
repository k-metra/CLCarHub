<?php

namespace Tests\Feature;

use App\Models\Fund;
use App\Models\FundTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FundTransferTest extends TestCase
{
    use RefreshDatabase;

    public function test_owner_can_transfer_available_balance_between_funds(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'owner']));
        $source = Fund::create(['name' => 'PayMongo', 'type' => 'e-wallet', 'opening_balance' => 1000]);
        $destination = Fund::create(['name' => 'Bank', 'type' => 'bank', 'opening_balance' => 50]);

        $this->postJson('/api/fund-transfers', [
            'source_fund_id' => $source->id,
            'destination_fund_id' => $destination->id,
            'transacted_at' => '2030-01-10 10:00',
            'amount' => 250,
            'notes' => 'Move PayMongo funds to bank',
        ])->assertCreated();

        $this->assertDatabaseHas('fund_transactions', [
            'fund_id' => $source->id,
            'type' => 'outflow',
            'amount' => '250.00',
            'description' => 'Transfer to Bank',
        ]);
        $this->assertDatabaseHas('fund_transactions', [
            'fund_id' => $destination->id,
            'type' => 'inflow',
            'amount' => '250.00',
            'description' => 'Transfer from PayMongo',
        ]);
        $this->assertSame(
            1,
            FundTransaction::whereNotNull('transfer_reference')->distinct('transfer_reference')->count(),
        );
    }

    public function test_transfer_cannot_exceed_source_balance_or_use_same_fund(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'owner']));
        $source = Fund::create(['name' => 'PayMongo', 'type' => 'e-wallet', 'opening_balance' => 100]);
        $destination = Fund::create(['name' => 'Cash', 'type' => 'cash', 'opening_balance' => 0]);

        $this->postJson('/api/fund-transfers', [
            'source_fund_id' => $source->id,
            'destination_fund_id' => $destination->id,
            'transacted_at' => '2030-01-10 10:00',
            'amount' => 101,
        ])->assertUnprocessable();
        $this->assertDatabaseCount('fund_transactions', 0);

        $this->postJson('/api/fund-transfers', [
            'source_fund_id' => $source->id,
            'destination_fund_id' => $source->id,
            'transacted_at' => '2030-01-10 10:00',
            'amount' => 1,
        ])->assertUnprocessable();
        $this->assertDatabaseCount('fund_transactions', 0);
    }
}
