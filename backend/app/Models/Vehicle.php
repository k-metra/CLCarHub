<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Vehicle extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['daily_rate' => 'decimal:2', 'weekly_rate' => 'decimal:2', 'monthly_rate' => 'decimal:2', 'deposit' => 'decimal:2'];
    }

    public function images(): HasMany
    {
        return $this->hasMany(VehicleImage::class);
    }

    public function bookings(): HasMany
    {
        return $this->hasMany(Booking::class);
    }
}
