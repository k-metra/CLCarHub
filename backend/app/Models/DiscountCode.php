<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DiscountCode extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'value' => 'decimal:2',
            'maximum_discount' => 'decimal:2',
            'minimum_booking_amount' => 'decimal:2',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'vehicle_types' => 'array',
            'new_customers_only' => 'boolean',
            'stackable' => 'boolean',
        ];
    }

    public function customers(): BelongsToMany
    {
        return $this->belongsToMany(Customer::class, 'discount_code_customers');
    }

    public function redemptions(): HasMany
    {
        return $this->hasMany(DiscountCodeRedemption::class);
    }

    public function getEffectiveStatusAttribute(): string
    {
        return app(\App\Services\DiscountCodeService::class)->effectiveStatus($this);
    }
}
