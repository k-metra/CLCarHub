<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Storage;

class Fund extends Model
{
    protected $guarded = ['id'];
    protected $appends = ['qr_code_url'];

    protected function casts(): array
    {
        return ['opening_balance' => 'decimal:2'];
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(FundTransaction::class);
    }

    public function getQrCodeUrlAttribute(): ?string
    {
        return $this->qr_code_path ? Storage::disk('public')->url($this->qr_code_path) : null;
    }
}
