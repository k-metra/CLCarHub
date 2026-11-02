<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Contract;
use App\Models\Booking;
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
            'signature_data' => ['nullable', 'string', 'max:700000', 'regex:/^data:image\/png;base64,[A-Za-z0-9+\/]+=*$/'],
            'options' => ['nullable', 'array'],
            'options.strict_destination' => ['sometimes', 'boolean'],
            'options.release_of_liability' => ['sometimes', 'boolean'],
            'options.no_smoking' => ['sometimes', 'boolean'],
            'options.carwash_payment' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'options.easytrip_before' => ['sometimes', 'nullable', 'string', 'max:255'],
            'options.easytrip_after' => ['sometimes', 'nullable', 'string', 'max:255'],
            'options.autosweep_before' => ['sometimes', 'nullable', 'string', 'max:255'],
            'options.autosweep_after' => ['sometimes', 'nullable', 'string', 'max:255'],
            'options.fuel_before' => ['sometimes', 'nullable', 'string', 'max:255'],
            'options.fuel_after' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);
        $booking = Booking::findOrFail($data['booking_id']);
        $data['options'] = array_merge($data['options'] ?? [], $this->bookingReadingOptions($booking));
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
            'signature_data' => ['nullable', 'string', 'max:700000', 'regex:/^data:image\/png;base64,[A-Za-z0-9+\/]+=*$/'],
            'options' => ['nullable', 'array'],
            'options.strict_destination' => ['sometimes', 'boolean'],
            'options.release_of_liability' => ['sometimes', 'boolean'],
            'options.no_smoking' => ['sometimes', 'boolean'],
            'options.carwash_payment' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'options.easytrip_before' => ['sometimes', 'nullable', 'string', 'max:255'],
            'options.easytrip_after' => ['sometimes', 'nullable', 'string', 'max:255'],
            'options.autosweep_before' => ['sometimes', 'nullable', 'string', 'max:255'],
            'options.autosweep_after' => ['sometimes', 'nullable', 'string', 'max:255'],
            'options.fuel_before' => ['sometimes', 'nullable', 'string', 'max:255'],
            'options.fuel_after' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);
        if (($data['status'] ?? null) === 'signed' && empty($data['signature_data']) && empty($contract->signature_data)) {
            abort(422, 'A signature is required before marking the contract as signed.');
        }
        if (($data['status'] ?? null) === 'signed' && ! $contract->signed_at) {
            $data['signed_at'] = now();
        }
        if (array_key_exists('options', $data)) {
            $data['options'] = array_merge($data['options'] ?? [], $this->bookingReadingOptions($contract->booking));
        }
        $contract->update($data);

        return $contract->fresh(['booking.customer', 'booking.vehicle.images', 'booking.payments', 'creator']);
    }

    public function destroy(Contract $contract)
    {
        $contract->delete();

        return response()->noContent();
    }

    private function bookingReadingOptions(Booking $booking): array
    {
        return collect([
            'easytrip_before' => $booking->handover_easytrip,
            'autosweep_before' => $booking->handover_autosweep,
            'fuel_before' => $booking->handover_fuel_bars,
            'easytrip_after' => $booking->return_easytrip,
            'autosweep_after' => $booking->return_autosweep,
            'fuel_after' => $booking->return_fuel_bars,
        ])->filter(fn ($value): bool => $value !== null)->map(fn ($value): string => (string) $value)->all();
    }
}
