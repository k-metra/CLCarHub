<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Vehicle;
use App\Services\AikaGpsService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class HostController extends Controller
{
    public function dashboard(Request $request)
    {
        $partner = $request->user()->partner()
            ->with([
                'vehicles.images',
                'vehicles.partnerContracts',
                'contractDocuments',
                'vehicles.bookings' => fn ($query) => $query->with(['customer', 'payments', 'contract']),
                'vehicleContracts.vehicle',
                'earnings.vehicle',
                'earnings.booking',
                'payouts',
            ])
            ->firstOrFail();

        abort_unless($partner->host_access_status === 'active', 403, 'Host Dashboard access is not active.');

        $gross = $partner->earnings->sum('gross_amount');
        $net = $partner->earnings->sum('net_amount');
        $paid = $partner->payouts->where('status', 'paid')->sum('amount');

        return [
            'partner' => $partner,
            'summary' => [
                'gross_earnings' => (float) $gross,
                'net_earnings' => (float) $net,
                'paid_out' => (float) $paid,
                'outstanding' => max(0, (float) $net - (float) $paid),
            ],
        ];
    }

    public function vehicleLocation(Request $request, Vehicle $vehicle, AikaGpsService $aikaGps)
    {
        $partner = $request->user()->partner()->firstOrFail();
        abort_unless($vehicle->partner_id === $partner->id, 404);

        return $aikaGps->location($vehicle);
    }

    public function bookings(Request $request)
    {
        $partner = $request->user()->partner()->firstOrFail();
        abort_unless($partner->host_access_status === 'active', 403, 'Host Dashboard access is not active.');

        return Booking::query()
            ->whereIn('vehicle_id', $partner->vehicles()->select('id'))
            ->with(['vehicle.images', 'contract'])
            ->orderByDesc('pickup_at')
            ->get()
            ->map(fn (Booking $booking): array => [
                'id' => $booking->id,
                'reference' => $booking->reference,
                'status' => $booking->status,
                'pickup_at' => $booking->pickup_at,
                'return_at' => $booking->return_at,
                'vehicle' => [
                    'id' => $booking->vehicle?->id,
                    'name' => $booking->vehicle?->name,
                    'brand' => $booking->vehicle?->brand,
                    'model' => $booking->vehicle?->model,
                    'plate_number' => $booking->vehicle?->plate_number,
                    'image_url' => ($booking->vehicle?->images?->firstWhere('is_primary', true) ?: $booking->vehicle?->images?->first())?->url,
                ],
                'contract' => $booking->contract ? [
                    'id' => $booking->contract->id,
                    'status' => $booking->contract->status,
                    'host_details' => $booking->contract->host_details,
                    'rate' => $booking->contract->host_details['rate'] ?? $booking->rental_rate,
                    'total_amount' => $booking->contract->host_details['total_amount'] ?? null,
                    'notes' => $booking->contract->host_details['notes'] ?? null,
                    'special_terms' => $booking->contract->host_details['special_terms'] ?? $booking->contract->special_terms,
                    'options' => $booking->contract->options,
                    'host_contract_images' => collect($booking->contract->host_contract_images ?? [])->map(fn (string $path): string => Storage::disk('public')->url($path))->values()->all(),
                ] : null,
            ])
            ->values();
    }

    public function contract(Request $request, Booking $booking)
    {
        $partner = $request->user()->partner()->firstOrFail();
        abort_unless($booking->vehicle && $booking->vehicle->partner_id === $partner->id, 404);

        $booking->load(['vehicle.images', 'contract']);

        return [
            'id' => $booking->id,
            'reference' => $booking->reference,
            'created_at' => $booking->created_at,
            'pickup_at' => $booking->pickup_at,
            'return_at' => $booking->return_at,
            'status' => $booking->status,
            'payment_method' => $booking->payment_method,
            'total_amount' => $booking->total_amount,
            'rental_amount' => $booking->rental_amount,
            'rental_rate' => $booking->rental_rate,
            'rental_discount' => $booking->rental_discount,
            'additional_charges' => $booking->additional_charges,
            'discount' => $booking->discount,
            'deposit' => $booking->deposit,
            'security_deposit_type' => $booking->security_deposit_type,
            'security_deposit_asset' => $booking->security_deposit_asset,
            'destination' => $booking->destination,
            'delivery_address' => $booking->delivery_address,
            'delivery_distance_km' => $booking->delivery_distance_km,
            'delivery_rate_per_km' => $booking->delivery_rate_per_km,
            'delivery_fee' => $booking->delivery_fee,
            'return_address' => $booking->return_address,
            'extension_fees' => $booking->extension_fees,
            'fuel_charge' => $booking->fuel_charge,
            'rfid_charge' => $booking->rfid_charge,
            'damage_fees' => $booking->damage_fees,
            'car_wash_fees' => $booking->car_wash_fees,
            'addons' => $booking->addons,
            'vehicle' => $booking->vehicle,
            'contract' => $booking->contract ? [
                ...$booking->contract->toArray(),
                'host_contract_images' => collect($booking->contract->host_contract_images ?? [])->map(fn (string $path): string => Storage::disk('public')->url($path))->values()->all(),
            ] : null,
        ];
    }
}
