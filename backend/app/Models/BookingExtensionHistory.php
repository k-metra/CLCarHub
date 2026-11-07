<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BookingExtensionHistory extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'previous_return_at' => 'datetime',
            'new_return_at' => 'datetime',
            'previous_extension_fees' => 'decimal:2',
            'new_extension_fees' => 'decimal:2',
            'previous_extension_pricing_applied' => 'boolean',
            'undone_at' => 'datetime',
        ];
    }

    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function undoer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'undone_by');
    }
}
