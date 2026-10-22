<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DiscountCodeRedemption extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['amount' => 'decimal:2'];
    }

    public function discountCode(): BelongsTo
    {
        return $this->belongsTo(DiscountCode::class);
    }
}
