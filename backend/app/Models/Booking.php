<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Booking extends Model
{
    protected $guarded = ['id'];

    protected $appends = ['balance'];

    protected function casts(): array
    {
        return ['pickup_at' => 'datetime', 'return_at' => 'datetime', 'rental_amount' => 'decimal:2', 'additional_charges' => 'decimal:2', 'discount' => 'decimal:2', 'deposit' => 'decimal:2', 'total_amount' => 'decimal:2', 'fuel_charge' => 'decimal:2', 'rfid_charge' => 'decimal:2', 'damage_fees' => 'decimal:2', 'car_wash_fees' => 'decimal:2', 'extension_fees' => 'decimal:2'];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
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

    public function getBalanceAttribute(): float
    {
        $paid = $this->relationLoaded('payments')
            ? $this->payments->sum(fn (Payment $payment) => (float) $payment->amount)
            : $this->payments()->sum('amount');

        return max(0, (float) $this->total_amount - $paid);
    }
}
