<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PartnerEarning extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['gross_amount' => 'decimal:2', 'commission_amount' => 'decimal:2', 'net_amount' => 'decimal:2', 'earned_at' => 'date'];
    }

    public function partner(): BelongsTo { return $this->belongsTo(Partner::class); }
    public function vehicle(): BelongsTo { return $this->belongsTo(Vehicle::class); }
    public function booking(): BelongsTo { return $this->belongsTo(Booking::class); }
}
