<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FleetSetting extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'reservation_fee' => 'decimal:2',
            'reservation_fee_deductible' => 'boolean',
            'default_hour_extension_rate' => 'decimal:2',
            'full_day_extension_threshold_hours' => 'integer',
            'late_return_grace_period_minutes' => 'integer',
        ];
    }
}
