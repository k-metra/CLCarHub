<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
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
            'rental_quantity' => 'integer',
        ];
    }

    public function availableRentalQuantity(Carbon|string|null $pickupAt = null, Carbon|string|null $returnAt = null, ?int $ignoreBookingId = null): int
    {
        $capacity = max(0, (int) ($this->rental_quantity ?? 1));
        if (! $this->is_rental || ! $pickupAt || ! $returnAt) {
            return $capacity;
        }

        $bookings = $this->rentalBookingConflicts($pickupAt, $returnAt, $ignoreBookingId);

        $reserved = $bookings->sum(fn (Booking $booking) => collect($booking->addons ?? [])
            ->where('id', $this->id)
            ->sum(fn (array $addon) => (int) ($addon['quantity'] ?? 0)));

        return max(0, $capacity - $reserved);
    }

    public function rentalBookingConflicts(Carbon|string $pickupAt, Carbon|string $returnAt, ?int $ignoreBookingId = null)
    {
        return Booking::query()
            ->whereIn('status', Booking::ACTIVE_STATUSES)
            ->where('pickup_at', '<', $returnAt)
            ->where('return_at', '>', $pickupAt)
            ->when($ignoreBookingId, fn ($query) => $query->where('id', '<>', $ignoreBookingId))
            ->get(['id', 'pickup_at', 'return_at', 'addons'])
            ->filter(fn (Booking $booking) => collect($booking->addons ?? [])->contains(
                fn (array $addon) => (int) ($addon['id'] ?? 0) === $this->id && (int) ($addon['quantity'] ?? 0) > 0
            ))
            ->values();
    }

    public function getImageUrlAttribute(): ?string
    {
        return $this->image_path ? Storage::disk('public')->url($this->image_path) : null;
    }
}
