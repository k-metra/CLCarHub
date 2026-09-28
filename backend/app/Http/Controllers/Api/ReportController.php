<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Vehicle;
use Illuminate\Http\Request;

class ReportController extends Controller
{
    public function revenue(Request $request)
    {
        $bookings = Booking::whereIn('status', ['paid', 'active', 'completed'])->when($request->from, fn ($q, $v) => $q->whereDate('created_at', '>=', $v))->when($request->to, fn ($q, $v) => $q->whereDate('created_at', '<=', $v));

        return ['total_revenue' => (float) $bookings->sum('total_amount'), 'booking_count' => $bookings->count()];
    }

    public function utilization(Request $request)
    {
        return Vehicle::withCount(['bookings' => fn ($q) => $q->whereIn('status', ['paid', 'active', 'completed'])])->get()->map(fn ($vehicle) => ['vehicle' => $vehicle->only(['id', 'brand', 'model', 'type']), 'bookings' => $vehicle->bookings_count]);
    }

    public function incomeFlow(Request $request)
    {
        return Booking::selectRaw('DATE(created_at) as date, SUM(total_amount) as gross_income')->whereIn('status', ['paid', 'active', 'completed'])->groupByRaw('DATE(created_at)')->orderBy('date')->get();
    }
}
