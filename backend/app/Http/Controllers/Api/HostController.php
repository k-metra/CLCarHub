<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

class HostController extends Controller
{
    public function dashboard(Request $request)
    {
        $partner = $request->user()->partner()
            ->with([
                'vehicles.images',
                'vehicles.partnerContracts',
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
}
