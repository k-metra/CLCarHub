<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class Addon extends Model
{
    protected $guarded = ['id'];

    protected $appends = ['image_url'];

    protected function casts(): array
    {
        return [
            'vehicle_types' => 'array',
            'pricing_tiers' => 'array',
            'is_rental' => 'boolean',
            'stock' => 'integer',
        ];
    }

    public function getImageUrlAttribute(): ?string
    {
        return $this->image_path ? Storage::disk('public')->url($this->image_path) : null;
    }
}
