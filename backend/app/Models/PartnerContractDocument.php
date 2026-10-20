<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

class PartnerContractDocument extends Model
{
    protected $guarded = ['id'];
    protected $appends = ['url'];

    public function partner(): BelongsTo
    {
        return $this->belongsTo(Partner::class);
    }

    public function getUrlAttribute(): string
    {
        return Storage::disk('public')->url($this->path);
    }
}
