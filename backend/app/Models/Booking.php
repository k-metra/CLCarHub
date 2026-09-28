<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Booking extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['pickup_at' => 'datetime', 'return_at' => 'datetime', 'rental_amount' => 'decimal:2', 'additional_charges' => 'decimal:2', 'discount' => 'decimal:2', 'deposit' => 'decimal:2', 'total_amount' => 'decimal:2'];
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
}
