<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Contract;
use Illuminate\Http\Request;

class HostContractController extends Controller
{
    public function index()
    {
        return Booking::query()
            ->with(['vehicle.images', 'contract'])
            ->latest('pickup_at')
            ->get()
            ->map(fn (Booking $booking): array => $this->resource($booking));
    }

    public function update(Request $request, Booking $booking)
    {
        $data = $request->validate([
            'host_details' => ['required', 'array'],
            'host_details.rate' => ['nullable', 'numeric', 'min:0'],
            'host_details.total_amount' => ['nullable', 'numeric', 'min:0'],
            'host_details.notes' => ['nullable', 'string'],
            'host_details.special_terms' => ['nullable', 'string'],
        ]);

        $contract = $booking->contract()->firstOrCreate(
            [],
            [
                'status' => 'draft',
                'created_by' => $request->user()?->id,
            ],
        );
        $contract->update(['host_details' => $data['host_details']]);

        return $this->resource($booking->fresh(['vehicle.images', 'contract']));
    }

    private function resource(Booking $booking): array
    {
        $contract = $booking->contract;

        return [
            'id' => $booking->id,
            'booking_id' => $booking->id,
            'contract_id' => $contract?->id,
            'status' => $contract?->status ?? 'not_created',
            'host_details' => $contract?->host_details,
            'special_terms' => $contract?->special_terms,
            'options' => $contract?->options,
            'booking' => [
                'id' => $booking->id,
                'reference' => $booking->reference,
                'pickup_at' => $booking->pickup_at,
                'return_at' => $booking->return_at,
                'rental_rate' => $booking->rental_rate,
                'rental_amount' => $booking->rental_amount,
                'total_amount' => $booking->total_amount,
                'vehicle' => [
                    'id' => $booking->vehicle?->id,
                    'name' => $booking->vehicle?->name,
                    'brand' => $booking->vehicle?->brand,
                    'model' => $booking->vehicle?->model,
                    'plate_number' => $booking->vehicle?->plate_number,
                    'image_url' => ($booking->vehicle?->images?->firstWhere('is_primary', true) ?: $booking->vehicle?->images?->first())?->url,
                ],
            ],
        ];
    }
}
