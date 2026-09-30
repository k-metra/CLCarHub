<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Contract;
use Illuminate\Http\Request;

class ContractController extends Controller
{
    public function index(Request $request)
    {
        return Contract::with(['booking.customer', 'booking.vehicle.images', 'creator'])
            ->when($request->search, fn ($query, $search) => $query->whereHas('booking', fn ($booking) => $booking
                ->where('reference', 'like', "%{$search}%")
                ->orWhereHas('customer', fn ($customer) => $customer->where('name', 'like', "%{$search}%"))
                ->orWhereHas('vehicle', fn ($vehicle) => $vehicle->where('name', 'like', "%{$search}%")->orWhere('brand', 'like', "%{$search}%")->orWhere('model', 'like', "%{$search}%"))))
            ->when($request->status, fn ($query, $status) => $query->where('status', $status))
            ->latest()
            ->get();
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'booking_id' => ['required', 'exists:bookings,id', 'unique:contracts,booking_id'],
            'status' => ['required', 'in:draft,generated,signed,completed,cancelled'],
            'special_terms' => ['nullable', 'string'],
            'options' => ['nullable', 'array'],
            'options.strict_destination' => ['sometimes', 'boolean'],
            'options.release_of_liability' => ['sometimes', 'boolean'],
            'options.no_smoking' => ['sometimes', 'boolean'],
            'options.carwash_payment' => ['sometimes', 'numeric', 'min:0'],
            'options.hour_extension_rate' => ['sometimes', 'numeric', 'min:0'],
        ]);
        $contract = Contract::create([...$data, 'created_by' => $request->user()?->id]);

        return response()->json($contract->load(['booking.customer', 'booking.vehicle.images', 'booking.payments', 'creator']), 201);
    }

    public function show(Contract $contract)
    {
        return $contract->load(['booking.customer', 'booking.vehicle.images', 'booking.payments', 'creator']);
    }

    public function update(Request $request, Contract $contract)
    {
        $data = $request->validate([
            'status' => ['sometimes', 'in:draft,generated,signed,completed,cancelled'],
            'special_terms' => ['nullable', 'string'],
            'options' => ['nullable', 'array'],
            'options.strict_destination' => ['sometimes', 'boolean'],
            'options.release_of_liability' => ['sometimes', 'boolean'],
            'options.no_smoking' => ['sometimes', 'boolean'],
            'options.carwash_payment' => ['sometimes', 'numeric', 'min:0'],
            'options.hour_extension_rate' => ['sometimes', 'numeric', 'min:0'],
        ]);
        if (($data['status'] ?? null) === 'signed' && ! $contract->signed_at) {
            $data['signed_at'] = now();
        }
        $contract->update($data);

        return $contract->fresh(['booking.customer', 'booking.vehicle.images', 'booking.payments', 'creator']);
    }

    public function destroy(Contract $contract)
    {
        $contract->delete();

        return response()->noContent();
    }
}
