<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Contract extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['signed_at' => 'datetime', 'options' => 'array', 'host_details' => 'array', 'host_contract_images' => 'array', 'host_view_published' => 'boolean'];
    }

    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
