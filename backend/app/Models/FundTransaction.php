<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FundTransaction extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['transacted_at' => 'datetime', 'amount' => 'decimal:2'];
    }

    public function fund(): BelongsTo
    {
        return $this->belongsTo(Fund::class);
    }

    public function payment(): BelongsTo
    {
        return $this->belongsTo(Payment::class);
    }

    protected $with = ['payment'];

    public function expense(): BelongsTo
    {
        return $this->belongsTo(Expense::class);
    }
}
