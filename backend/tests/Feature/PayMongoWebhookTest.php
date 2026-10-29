<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\Vehicle;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class PayMongoWebhookTest extends TestCase
{
    use RefreshDatabase;

    public function test_invalid_paymongo_webhook_signatures_are_rejected(): void
    {
        config(['services.paymongo.webhook_secret' => 'webhook-secret']);

        $this->withHeader('Paymongo-Signature', 't=123,li=invalid')
            ->postJson('/api/payments/paymongo/webhook', ['data' => ['attributes' => ['type' => 'checkout_session.payment.paid']]])
            ->assertForbidden();
    }

    public function test_paid_checkout_webhook_records_payment_and_is_idempotent(): void
    {
        Notification::fake();
        config(['services.paymongo.webhook_secret' => 'webhook-secret']);

        $user = \App\Models\User::factory()->create(['role' => 'customer']);
        $customer = $user->customer()->create(['name' => 'Customer', 'email' => 'customer@example.com']);
        $vehicle = Vehicle::create([
            'brand' => 'Toyota',
            'model' => 'Vios',
            'type' => 'sedan',
            'plate_number' => 'PAY-123',
            'daily_rate' => 2000,
            'status' => 'available',
        ]);
        $booking = Booking::create([
            'reference' => 'CLCH-2030-000777',
            'customer_id' => $customer->id,
            'vehicle_id' => $vehicle->id,
            'paymongo_checkout_session_id' => 'cs_test_123',
            'pickup_at' => '2030-01-10 10:00',
            'return_at' => '2030-01-11 10:00',
            'status' => Booking::PENDING,
            'payment_status' => 'unpaid',
            'rental_amount' => 2000,
            'total_amount' => 2000,
        ]);

        $payload = [
            'data' => [
                'id' => 'evt_test_123',
                'attributes' => [
                    'type' => 'checkout_session.payment.paid',
                    'data' => [
                        'id' => 'cs_test_123',
                        'attributes' => [
                            'reference_number' => $booking->reference,
                            'line_items' => [['amount' => 100000, 'quantity' => 1]],
                            'payments' => [['attributes' => ['amount_paid' => 103000, 'fee' => 3000]]],
                        ],
                    ],
                ],
            ],
        ];
        $rawPayload = json_encode($payload, JSON_THROW_ON_ERROR);
        $signature = 't=123,li='.hash_hmac('sha256', '123.'.$rawPayload, 'webhook-secret');

        $this->withHeader('Paymongo-Signature', $signature)
            ->postJson('/api/payments/paymongo/webhook', $payload)
            ->assertOk()
            ->assertJson(['received' => true]);

        $this->assertDatabaseHas('payments', [
            'booking_id' => $booking->id,
            'provider' => 'paymongo',
            'provider_reference' => 'cs_test_123',
            'amount' => '1000.00',
        ]);
        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'status' => Booking::UPCOMING,
            'payment_status' => 'partial',
        ]);
        $this->assertDatabaseCount('payments', 1);
        $this->assertDatabaseCount('fund_transactions', 1);

        $booking->update(['paymongo_checkout_session_id' => 'cs_test_456']);
        $secondPayload = [
            'data' => [
                'id' => 'evt_test_456',
                'attributes' => [
                    'type' => 'payment.paid',
                    'data' => [
                        'id' => 'py_test_456',
                        'attributes' => [
                            'checkout_session' => [
                                'id' => 'cs_test_456',
                                'attributes' => [
                                    'reference_number' => $booking->reference,
                                    'line_items' => [['amount' => 100000, 'quantity' => 1]],
                                    'payments' => [['attributes' => ['amount_paid' => 103000, 'fee' => 3000]]],
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ];
        $secondRawPayload = json_encode($secondPayload, JSON_THROW_ON_ERROR);
        $secondSignature = 't=456,li='.hash_hmac('sha256', '456.'.$secondRawPayload, 'webhook-secret');

        $this->withHeader('Paymongo-Signature', $secondSignature)
            ->postJson('/api/payments/paymongo/webhook', $secondPayload)
            ->assertOk();

        $this->assertDatabaseHas('payments', [
            'booking_id' => $booking->id,
            'provider' => 'paymongo',
            'provider_reference' => 'cs_test_456',
            'amount' => '1000.00',
        ]);
        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'status' => Booking::UPCOMING,
            'payment_status' => 'paid',
        ]);
        $this->assertDatabaseCount('payments', 2);
        $this->assertDatabaseCount('fund_transactions', 2);

        $this->withHeader('Paymongo-Signature', $secondSignature)
            ->postJson('/api/payments/paymongo/webhook', $secondPayload)
            ->assertOk();

        $this->assertDatabaseCount('payments', 2);
        $this->assertDatabaseCount('fund_transactions', 2);
    }
}
