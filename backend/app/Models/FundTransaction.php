<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FundTransaction extends Model
{
    protected $guarded = ['id'];

    protected static function booted(): void
    {
        static::deleting(function (self $transaction): void {
            abort_if($transaction->isTransfer(), 422, 'Fund transfer transactions cannot be deleted as standalone transactions.');
        });
    }

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

    public function isTransfer(): bool
    {
        return filled($this->transfer_reference)
            || str_starts_with((string) $this->description, 'Transfer to ')
            || str_starts_with((string) $this->description, 'Transfer from ');
    }
}
