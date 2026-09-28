<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Vehicle;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class VehicleController extends Controller
{
    public function index(Request $request)
    {
        return Vehicle::with('images')->when($request->search, fn ($q, $s) => $q->where(fn ($q) => $q->where('brand', 'like', "%$s%")->orWhere('model', 'like', "%$s%")->orWhere('plate_number', 'like', "%$s%")))->when($request->type, fn ($q, $v) => $q->where('type', $v))->when($request->status, fn ($q, $v) => $q->where('status', $v))->latest()->paginate(15);
    }

    public function store(Request $request)
    {
        return response()->json(Vehicle::create($request->validate($this->rules())), 201);
    }

    public function show(Vehicle $vehicle)
    {
        return $vehicle->load('images');
    }

    public function update(Request $request, Vehicle $vehicle)
    {
        $rules = $this->rules();
        $rules['plate_number'] = ['required', 'string', Rule::unique('vehicles')->ignore($vehicle)];
        $vehicle->update($request->validate($rules));

        return $vehicle->fresh('images');
    }

    public function destroy(Vehicle $vehicle)
    {
        $vehicle->update(['status' => 'archived']);

        return response()->noContent();
    }

    public function availability(Request $request, Vehicle $vehicle)
    {
        $data = $request->validate(['pickup_at' => ['required', 'date'], 'return_at' => ['required', 'date', 'after:pickup_at']]);

        return ['available' => $vehicle->status === 'available' && ! $vehicle->bookings()->whereIn('status', ['pending', 'confirmed', 'awaiting_payment', 'paid', 'active'])->where('pickup_at', '<', $data['return_at'])->where('return_at', '>', $data['pickup_at'])->exists()];
    }

    private function rules(): array
    {
        return ['brand' => ['required', 'string', 'max:100'], 'model' => ['required', 'string', 'max:100'], 'variant' => ['nullable', 'string'], 'year' => ['nullable', 'integer'], 'type' => ['required', 'string'], 'plate_number' => ['required', 'string', 'unique:vehicles,plate_number'], 'transmission' => ['nullable', 'string'], 'fuel_type' => ['nullable', 'string'], 'seats' => ['nullable', 'integer'], 'color' => ['nullable', 'string'], 'daily_rate' => ['required', 'numeric', 'min:0'], 'weekly_rate' => ['nullable', 'numeric', 'min:0'], 'monthly_rate' => ['nullable', 'numeric', 'min:0'], 'deposit' => ['nullable', 'numeric', 'min:0'], 'description' => ['nullable', 'string'], 'status' => ['nullable', 'in:available,reserved,rented,maintenance,unavailable,archived']];
    }
}
