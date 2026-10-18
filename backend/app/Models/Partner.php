<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Partner extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['commission_value' => 'decimal:2'];
    }

    public function vehicles(): HasMany
    {
        return $this->hasMany(Vehicle::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function vehicleContracts(): HasMany
    {
        return $this->hasMany(PartnerVehicleContract::class);
    }

    public function earnings(): HasMany
    {
        return $this->hasMany(PartnerEarning::class);
    }

    public function payouts(): HasMany
    {
        return $this->hasMany(PartnerPayout::class);
    }

    public function payoutMethods(): HasMany
    {
        return $this->hasMany(PartnerPayoutMethod::class);
    }
}
