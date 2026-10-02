<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class Vehicle extends Model
{
    protected $guarded = ['id'];

    protected $appends = ['coding_day', 'is_coding_today'];

    protected function casts(): array
    {
        return ['daily_rate' => 'decimal:2', 'hour_extension_rate' => 'decimal:2', 'weekly_rate' => 'decimal:2', 'monthly_rate' => 'decimal:2', 'deposit' => 'decimal:2', 'security_deposit_fee' => 'decimal:2'];
    }

    public function images(): HasMany
    {
        return $this->hasMany(VehicleImage::class)->orderByDesc('is_primary')->orderByDesc('id');
    }

    public function bookings(): HasMany
    {
        return $this->hasMany(Booking::class);
    }

    public function partner(): BelongsTo
    {
        return $this->belongsTo(Partner::class);
    }

    public function getCodingDayAttribute(): ?string
    {
        if (strtolower($this->type) !== 'car' || $this->isElectricOrHybrid()) {
            return null;
        }

        $plateDigits = preg_replace('/\D/', '', $this->plate_number);
        if ($plateDigits === '') {
            return null;
        }

        $lastDigit = (int) substr($plateDigits, -1);

        return match (true) {
            in_array($lastDigit, [1, 2], true) => 'Monday',
            in_array($lastDigit, [3, 4], true) => 'Tuesday',
            in_array($lastDigit, [5, 6], true) => 'Wednesday',
            in_array($lastDigit, [7, 8], true) => 'Thursday',
            in_array($lastDigit, [9, 0], true) => 'Friday',
            default => null,
        };
    }

    public function getIsCodingTodayAttribute(): bool
    {
        return $this->coding_day !== null && $this->coding_day === now()->format('l');
    }

    private function isElectricOrHybrid(): bool
    {
        $fuelType = Str::lower(str_replace([' ', '/', '-'], '', (string) $this->fuel_type));

        return in_array($fuelType, ['ev', 'phev', 'hev', 'phevhev', 'evphev'], true);
    }
}
