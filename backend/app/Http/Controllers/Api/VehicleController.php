<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Vehicle;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class VehicleController extends Controller
{
    private const VEHICLE_TYPES = ['sedan', 'motorcycle', 'auv', 'crossover', 'mpv', 'pickup', 'suv', 'van', 'hatchback'];
    private const GALLERY_IMAGE_TYPES = ['back', 'front', 'left', 'right', 'interior_back', 'interior_front', 'trunk', 'thumbnail'];

    public function index(Request $request)
    {
        return Vehicle::with(['images', 'partner'])->when($request->search, fn ($q, $s) => $q->where(fn ($q) => $q->where('name', 'like', "%$s%")->orWhere('brand', 'like', "%$s%")->orWhere('model', 'like', "%$s%")->orWhere('plate_number', 'like', "%$s%")))->when($request->type, fn ($q, $v) => $q->where('type', $v))->when($request->partner_id === 'none', fn ($q) => $q->whereNull('partner_id'))->when($request->partner_id && $request->partner_id !== 'none', fn ($q) => $q->where('partner_id', $request->partner_id))->when($request->status, fn ($q, $v) => $q->where('status', $v))->orderByRaw("status = 'archived' asc")->latest()->paginate(min(100, max(1, (int) $request->input('per_page', 15))));
    }

    public function featured()
    {
        return Vehicle::with(['images', 'partner'])
            ->where('status', 'available')
            ->whereHas('images', fn ($query) => $query->where('image_type', 'thumbnail'))
            ->latest()
            ->get();
    }

    public function available(Request $request)
    {
        $data = $request->validate([
            'type' => ['required', Rule::in(self::VEHICLE_TYPES)],
            'pickup_at' => ['required', 'date'],
            'return_at' => ['required', 'date', 'after:pickup_at'],
        ]);

        return Vehicle::with(['images', 'partner'])
            ->where('type', $data['type'])
            ->where('status', 'available')
            ->whereDoesntHave('bookings', fn ($query) => $query
                ->whereIn('status', \App\Models\Booking::ACTIVE_STATUSES)
                ->where('pickup_at', '<', $data['return_at'])
                ->where('return_at', '>', $data['pickup_at']))
            ->latest()
            ->get();
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->rules());
        $image = $data['image'] ?? null;
        unset($data['image']);
        $vehicle = Vehicle::create($data);
        $this->storeImage($vehicle, $image);

        return response()->json($vehicle->load(['images', 'partner']), 201);
    }

    public function show(Vehicle $vehicle)
    {
        return $vehicle->load(['images', 'partner']);
    }

    public function update(Request $request, Vehicle $vehicle)
    {
        $rules = $this->rules();
        $rules['plate_number'] = ['required', 'string', Rule::unique('vehicles')->ignore($vehicle)];
        $data = $request->validate($rules);
        $image = $data['image'] ?? null;
        unset($data['image']);
        $vehicle->update($data);
        $this->storeImage($vehicle, $image);

        return $vehicle->fresh(['images', 'partner']);
    }

    public function uploadImage(Request $request, Vehicle $vehicle)
    {
        $data = $request->validate(['image' => ['required', 'image', 'max:20480']]);
        $this->storeImage($vehicle, $data['image']);

        return $vehicle->fresh(['images', 'partner']);
    }

    public function uploadGalleryImage(Request $request, Vehicle $vehicle)
    {
        $data = $request->validate([
            'image' => ['required', 'image', 'max:20480'],
            'image_type' => ['required', Rule::in(self::GALLERY_IMAGE_TYPES)],
        ]);

        $this->storeGalleryImage($vehicle, $data['image'], $data['image_type']);

        return $vehicle->fresh(['images', 'partner']);
    }

    public function deleteGalleryImage(Vehicle $vehicle, string $imageType)
    {
        abort_unless(in_array($imageType, self::GALLERY_IMAGE_TYPES, true), 404);

        $image = $vehicle->images()->where('image_type', $imageType)->first();
        if ($image) {
            Storage::disk('public')->delete($image->path);
            $image->delete();
        }

        return $vehicle->fresh(['images', 'partner']);
    }

    public function destroy(Vehicle $vehicle)
    {
        $vehicle->update(['status' => 'archived']);

        return response()->noContent();
    }

    public function restore(Vehicle $vehicle)
    {
        $vehicle->update(['status' => 'available']);

        return $vehicle->fresh(['images', 'partner']);
    }

    public function availability(Request $request, Vehicle $vehicle)
    {
        $data = $request->validate(['pickup_at' => ['required', 'date'], 'return_at' => ['required', 'date', 'after:pickup_at']]);
        $conflicts = $vehicle->bookings()
            ->whereIn('status', \App\Models\Booking::ACTIVE_STATUSES)
            ->where('pickup_at', '<', $data['return_at'])
            ->where('return_at', '>', $data['pickup_at'])
            ->get(['pickup_at', 'return_at'])
            ->map(fn ($booking) => [
                'pickup_at' => $booking->pickup_at,
                'return_at' => $booking->return_at,
            ])
            ->values();

        return [
            'available' => $vehicle->status === 'available' && $conflicts->isEmpty(),
            'conflicts' => $conflicts,
        ];
    }

    private function rules(): array
    {
        return ['name' => ['nullable', 'string', 'max:100'], 'brand' => ['required', 'string', 'max:100'], 'model' => ['required', 'string', 'max:100'], 'variant' => ['nullable', 'string'], 'year' => ['required', 'integer', 'min:1900', 'max:'.(now()->year + 1)], 'type' => ['required', Rule::in(self::VEHICLE_TYPES)], 'plate_number' => ['required', 'string', 'unique:vehicles,plate_number'], 'transmission' => ['required', 'in:manual,automatic'], 'fuel_type' => ['required', 'in:regular_unleaded,premium_95,premium_98,diesel,ev_phev'], 'seats' => ['required', 'integer', 'min:1'], 'color' => ['required', 'string', 'max:50'], 'daily_rate' => ['required', 'numeric', 'min:0'], 'mileage_limit' => ['nullable', 'integer', 'min:0'], 'hour_extension_rate' => ['nullable', 'numeric', 'min:0'], 'security_deposit_fee' => ['nullable', 'numeric', 'min:0'], 'delivery_rate_per_km' => ['nullable', 'numeric', 'min:0'], 'ownership' => ['nullable', 'string', 'max:150'], 'partner_id' => ['nullable', 'exists:partners,id'], 'description' => ['nullable', 'string'], 'status' => ['required', 'in:available,maintenance,reserved,rented,unavailable,archived'], 'image' => ['nullable', 'image', 'max:20480']];
    }

    private function storeImage(Vehicle $vehicle, ?UploadedFile $image): void
    {
        if (! $image) {
            return;
        }

        $path = $image->store('vehicles', 'public');
        abort_unless(is_string($path) && Storage::disk('public')->exists($path), 500, 'The vehicle image could not be saved. Check storage permissions and disk configuration.');
        $vehicle->images()->whereNull('image_type')->update(['is_primary' => false]);
        $vehicle->images()->create(['path' => $path, 'is_primary' => true, 'image_type' => null]);
    }

    private function storeGalleryImage(Vehicle $vehicle, UploadedFile $image, string $imageType): void
    {
        $path = $image->store('vehicles', 'public');
        abort_unless(is_string($path) && Storage::disk('public')->exists($path), 500, 'The vehicle image could not be saved. Check storage permissions and disk configuration.');

        $vehicle->images()->where('image_type', $imageType)->each(function ($existingImage): void {
            Storage::disk('public')->delete($existingImage->path);
            $existingImage->delete();
        });
        $vehicle->images()->create(['path' => $path, 'is_primary' => false, 'image_type' => $imageType]);
    }
}
