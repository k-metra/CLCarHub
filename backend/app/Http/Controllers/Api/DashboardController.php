<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function index()
    {
        $year = now()->year;
        $revenueStatuses = ['paid', 'active', 'completed'];
        $bookings = Booking::query();
        $monthExpression = DB::connection()->getDriverName() === 'sqlite'
            ? "CAST(strftime('%m', created_at) AS INTEGER)"
            : 'MONTH(created_at)';

        $summary = [
            'upcoming' => $this->statusSummary($bookings, ['pending', 'confirmed', 'awaiting_payment', 'paid'], 'pickup_at', '>='),
            'ongoing' => $this->statusSummary($bookings, ['active'], 'pickup_at', '<='),
            'finished' => $this->statusSummary($bookings, ['completed'], 'return_at', '<'),
        ];

        $monthlyRevenue = Booking::query()
            ->selectRaw("{$monthExpression} as month, SUM(total_amount) as amount")
            ->whereIn('status', $revenueStatuses)
            ->whereYear('created_at', $year)
            ->groupByRaw($monthExpression)
            ->pluck('amount', 'month');

        $monthlyBookings = Booking::query()
            ->selectRaw("{$monthExpression} as month, COUNT(*) as count")
            ->whereYear('created_at', $year)
            ->groupByRaw($monthExpression)
            ->pluck('count', 'month');

        $topVehicles = Booking::query()
            ->join('vehicles', 'vehicles.id', '=', 'bookings.vehicle_id')
            ->select('vehicles.id', 'vehicles.name', 'vehicles.brand', 'vehicles.model', 'vehicles.year')
            ->selectRaw('SUM(bookings.total_amount) as revenue')
            ->whereIn('bookings.status', $revenueStatuses)
            ->groupBy('vehicles.id', 'vehicles.name', 'vehicles.brand', 'vehicles.model', 'vehicles.year')
            ->orderByDesc('revenue')
            ->limit(5)
            ->get();

        $upcomingBookings = Booking::with(['customer', 'vehicle.images'])
            ->whereIn('status', ['pending', 'confirmed', 'awaiting_payment', 'paid'])
            ->where('pickup_at', '>=', now())
            ->orderBy('pickup_at')
            ->limit(5)
            ->get();

        return [
            'year' => $year,
            'summary' => $summary,
            'financial' => [
                'total_bookings' => Booking::count(),
                'total_revenue' => (float) Booking::whereIn('status', $revenueStatuses)->sum('total_amount'),
                'total_expenses' => 0,
                'total_profit' => (float) Booking::whereIn('status', $revenueStatuses)->sum('total_amount'),
            ],
            'monthly' => collect(range(1, 12))->map(fn (int $month) => [
                'month' => $month,
                'revenue' => (float) ($monthlyRevenue[$month] ?? 0),
                'bookings' => (int) ($monthlyBookings[$month] ?? 0),
            ])->values(),
            'top_vehicles' => $topVehicles,
            'upcoming_bookings' => $upcomingBookings,
        ];
    }

    private function statusSummary($query, array $statuses, string $dateColumn, string $operator): array
    {
        $rows = (clone $query)
            ->whereIn('status', $statuses)
            ->when($operator === '>=', fn ($builder) => $builder->where($dateColumn, '>=', now()))
            ->when($operator === '<=', fn ($builder) => $builder->where('pickup_at', '<=', now())->where('return_at', '>', now()))
            ->when($operator === '<', fn ($builder) => $builder->where($dateColumn, '<', now()))
            ->get(['total_amount']);

        return ['count' => $rows->count(), 'receivables' => (float) $rows->sum('total_amount')];
    }
}
