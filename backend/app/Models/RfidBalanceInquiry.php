<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RfidBalanceInquiry extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'account_number' => 'encrypted',
            'balance' => 'decimal:2',
            'requested_at' => 'datetime',
            'expires_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class);
    }
}
