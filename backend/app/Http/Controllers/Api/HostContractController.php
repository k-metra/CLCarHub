<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Contract;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class HostContractController extends Controller
{
    public function index(Request $request)
    {
        $query = Booking::query()
            ->with(['customer', 'vehicle.images', 'vehicle.partner', 'contract'])
            ->when($request->search, function ($query, $search): void {
                $query->where(function ($query) use ($search): void {
                    $query->where('reference', 'like', "%{$search}%")
                        ->orWhereHas('customer', fn ($customer) => $customer->where('name', 'like', "%{$search}%"))
                        ->orWhereHas('vehicle', fn ($vehicle) => $vehicle
                            ->where('name', 'like', "%{$search}%")
                            ->orWhere('brand', 'like', "%{$search}%")
                            ->orWhere('model', 'like', "%{$search}%")
                            ->orWhere('plate_number', 'like', "%{$search}%")
                            ->orWhereHas('partner', fn ($partner) => $partner->where('name', 'like', "%{$search}%")));
                });
            })
            ->latest('pickup_at')
            ->paginate(min(50, max(1, (int) $request->input('per_page', 15))));

        return $query->through(fn (Booking $booking): array => $this->resource($booking));
    }

    public function update(Request $request, Booking $booking)
    {
        $data = $request->validate([
            'host_details' => ['required', 'array'],
            'host_details.rate' => ['nullable', 'numeric', 'min:0'],
            'host_contract_images' => ['nullable', 'array', 'max:10'],
            'host_contract_images.*' => ['required', 'image', 'mimes:jpeg,jpg,png,webp', 'max:10240'],
        ]);

        $contract = $booking->contract()->firstOrCreate(
            [],
            [
                'status' => 'draft',
                'created_by' => $request->user()?->id,
            ],
        );
        $images = $contract->host_contract_images ?? [];
        if (count($images) + count($request->file('host_contract_images', [])) > 10) {
            throw ValidationException::withMessages([
                'host_contract_images' => 'A booking may have up to 10 physical contract images.',
            ]);
        }
        foreach ($request->file('host_contract_images', []) as $image) {
            abort_if(count($images) >= 10, 422, 'A booking may have up to 10 physical contract images.');
            $path = $image->store('contracts/host', 'public');
            abort_unless(is_string($path) && Storage::disk('public')->exists($path), 500, 'The physical contract image could not be saved.');
            $images[] = $path;
        }
        $contract->update(['host_details' => ['rate' => $data['host_details']['rate'] ?? null], 'host_contract_images' => $images]);

        return $this->resource($booking->fresh(['vehicle.images', 'contract']));
    }

    public function publish(Request $request, Booking $booking)
    {
        $contract = $booking->contract()->firstOrFail();
        $contract->update(['host_view_published' => true]);

        return $this->resource($booking->fresh(['vehicle.images', 'contract']));
    }

    public function revoke(Request $request, Booking $booking)
    {
        $contract = $booking->contract()->firstOrFail();
        $contract->update(['host_view_published' => false]);

        return $this->resource($booking->fresh(['vehicle.images', 'contract']));
    }

    public function deleteImage(Request $request, Booking $booking, int $image)
    {
        $contract = $booking->contract()->firstOrFail();
        $images = $contract->host_contract_images ?? [];
        abort_unless(array_key_exists($image, $images), 404);

        $path = $images[$image];
        if (is_string($path)) {
            Storage::disk('public')->delete($path);
        }
        array_splice($images, $image, 1);
        $contract->update(['host_contract_images' => array_values($images)]);

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
            'host_details' => [
                'rate' => $contract?->host_details['rate'] ?? null,
            ],
            'host_view_published' => (bool) $contract?->host_view_published,
            'host_contract_images' => collect($contract?->host_contract_images ?? [])->map(fn (string $path): string => Storage::disk('public')->url($path))->values()->all(),
            'booking' => [
                'id' => $booking->id,
                'reference' => $booking->reference,
                'pickup_at' => $booking->pickup_at,
                'return_at' => $booking->return_at,
                'customer' => [
                    'name' => $booking->customer?->name,
                ],
                'rental_rate' => $booking->rental_rate,
                'rental_amount' => $booking->rental_amount,
                'total_amount' => $booking->total_amount,
                'vehicle' => [
                    'id' => $booking->vehicle?->id,
                    'name' => $booking->vehicle?->name,
                    'brand' => $booking->vehicle?->brand,
                    'model' => $booking->vehicle?->model,
                    'plate_number' => $booking->vehicle?->plate_number,
                    'partner' => [
                        'name' => $booking->vehicle?->partner?->name,
                    ],
                    'image_url' => ($booking->vehicle?->images?->firstWhere('is_primary', true) ?: $booking->vehicle?->images?->first())?->url,
                ],
            ],
        ];
    }
}
