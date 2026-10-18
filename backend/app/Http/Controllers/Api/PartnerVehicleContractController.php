<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Partner;
use App\Models\PartnerVehicleContract;
use App\Models\Vehicle;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class PartnerVehicleContractController extends Controller
{
    public function store(Request $request, Partner $partner)
    {
        $data = $request->validate([
            'vehicle_id' => ['required', 'exists:vehicles,id'],
            'status' => ['required', Rule::in(['draft', 'pending', 'approved', 'suspended', 'expired'])],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date', 'after_or_equal:starts_at'],
            'terms' => ['nullable', 'string'],
        ]);
        $vehicle = Vehicle::findOrFail($data['vehicle_id']);
        abort_unless($vehicle->partner_id === $partner->id, 422, 'The vehicle is not associated with this partner.');

        $contract = DB::transaction(function () use ($data, $partner, $vehicle, $request) {
            $contract = PartnerVehicleContract::updateOrCreate(
                ['partner_id' => $partner->id, 'vehicle_id' => $vehicle->id],
                [...$data, 'approved_by' => $data['status'] === 'approved' ? $request->user()->id : null, 'approved_at' => $data['status'] === 'approved' ? now() : null],
            );

            return $contract;
        });

        return response()->json($contract->load('vehicle'), 201);
    }

    public function update(Request $request, PartnerVehicleContract $partnerVehicleContract)
    {
        $data = $request->validate([
            'status' => ['sometimes', Rule::in(['draft', 'pending', 'approved', 'suspended', 'expired'])],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date', 'after_or_equal:starts_at'],
            'terms' => ['nullable', 'string'],
        ]);
        if (($data['status'] ?? null) === 'approved') {
            $data['approved_by'] = $request->user()->id;
            $data['approved_at'] = now();
        }
        $partnerVehicleContract->update($data);

        return $partnerVehicleContract->fresh('vehicle');
    }
}
