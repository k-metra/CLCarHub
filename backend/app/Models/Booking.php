<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Builder;

class Booking extends Model
{
    public const PENDING = 'pending';
    public const UPCOMING = 'upcoming';
    public const ONGOING = 'ongoing';
    public const COMPLETE = 'complete';
    public const REJECTED = 'rejected';
    public const CANCELLED = 'cancelled';

    public const ACTIVE_STATUSES = [self::PENDING, self::UPCOMING, self::ONGOING];

    protected $guarded = ['id'];

    protected $appends = ['balance', 'status_reason'];

    protected function casts(): array
    {
        return ['pickup_at' => 'datetime', 'return_at' => 'datetime', 'rental_amount' => 'decimal:2', 'rental_rate' => 'decimal:2', 'additional_charges' => 'decimal:2', 'discount' => 'decimal:2', 'deposit' => 'decimal:2', 'total_amount' => 'decimal:2', 'fuel_charge' => 'decimal:2', 'rfid_charge' => 'decimal:2', 'damage_fees' => 'decimal:2', 'car_wash_fees' => 'decimal:2', 'extension_fees' => 'decimal:2', 'delivery_distance_km' => 'decimal:2', 'delivery_rate_per_km' => 'decimal:2', 'delivery_fee' => 'decimal:2', 'delivery_latitude' => 'decimal:7', 'delivery_longitude' => 'decimal:7', 'return_latitude' => 'decimal:7', 'return_longitude' => 'decimal:7', 'return_distance_km' => 'decimal:2', 'return_pickup_fee' => 'decimal:2'];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function scopeVisibleToAdmin(Builder $query, bool $includeArchived = false): Builder
    {
        return $includeArchived
            ? $query
            : $query->whereHas('customer', fn (Builder $customer) => $customer->whereNull('archived_at'));
    }

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function statusHistory(): HasMany
    {
        return $this->hasMany(BookingStatusHistory::class)->latest();
    }

    public function getBalanceAttribute(): float
    {
        if (in_array($this->status, ['cancelled', 'rejected'], true)) {
            return 0;
        }

        $paid = $this->relationLoaded('payments')
            ? $this->payments->sum(fn (Payment $payment) => (float) $payment->amount)
            : $this->payments()->sum('amount');

        return max(0, (float) $this->total_amount - $paid);
    }

    public function getStatusReasonAttribute(): ?string
    {
        if (! $this->relationLoaded('statusHistory')) {
            $history = $this->statusHistory()->whereIn('to_status', ['cancelled', 'rejected'])->latest('id')->first();
        } else {
            $history = $this->statusHistory
                ->whereIn('to_status', ['cancelled', 'rejected'])
                ->sortByDesc('id')
                ->first();
        }

        return $history?->reason;
    }

    public static function synchronizeAutomaticStatuses(): void
    {
        $now = now();

        self::query()
            ->where('status', self::UPCOMING)
            ->where('return_at', '<=', $now)
            ->each(function (self $booking): void {
                $booking->transitionAutomatically(self::COMPLETE);
            });

        self::query()
            ->where('status', self::UPCOMING)
            ->where('pickup_at', '<=', $now)
            ->where('return_at', '>', $now)
            ->each(function (self $booking): void {
                $booking->transitionAutomatically(self::ONGOING);
            });

        self::query()
            ->where('status', self::ONGOING)
            ->where('return_at', '<=', $now)
            ->each(function (self $booking): void {
                $booking->transitionAutomatically(self::COMPLETE);
            });
    }

    private function transitionAutomatically(string $status): void
    {
        $oldStatus = $this->status;
        $this->update(['status' => $status]);
        $this->statusHistory()->create([
            'from_status' => $oldStatus,
            'to_status' => $status,
            'reason' => 'Automatically updated based on the booking schedule.',
        ]);
    }
}
