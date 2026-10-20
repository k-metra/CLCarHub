<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PartnerPayout extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['amount' => 'decimal:2', 'paid_at' => 'date', 'payout_sms_sent_at' => 'datetime'];
    }

    public function partner(): BelongsTo { return $this->belongsTo(Partner::class); }
    public function processor(): BelongsTo { return $this->belongsTo(User::class, 'processed_by'); }
    public function fund(): BelongsTo { return $this->belongsTo(Fund::class); }
    public function payoutMethod(): BelongsTo { return $this->belongsTo(PartnerPayoutMethod::class, 'partner_payout_method_id'); }
}
