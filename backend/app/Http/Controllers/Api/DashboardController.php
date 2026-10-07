<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Expense;
use Illuminate\Support\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function index(Request $request)
    {
        Booking::synchronizeAutomaticStatuses();
        $year = now()->year;
        $revenueStatuses = [Booking::ONGOING, Booking::COMPLETE];
        $includeArchived = $request->boolean('include_archived');
        $bookings = Booking::query()->visibleToAdmin($includeArchived);
        $monthExpression = DB::connection()->getDriverName() === 'sqlite'
            ? "CAST(strftime('%m', created_at) AS INTEGER)"
            : 'MONTH(created_at)';

        $summary = [
            'upcoming' => $this->statusSummary($bookings, [Booking::UPCOMING], 'pickup_at', '>='),
            'ongoing' => $this->statusSummary($bookings, [Booking::ONGOING], 'pickup_at', '<='),
            'complete' => $this->statusSummary($bookings, [Booking::COMPLETE], 'return_at', '<'),
        ];

        $monthlyRevenue = Booking::query()->visibleToAdmin($includeArchived)
            ->selectRaw("{$monthExpression} as month, SUM(total_amount) as amount")
            ->whereIn('status', $revenueStatuses)
            ->whereYear('created_at', $year)
            ->groupByRaw($monthExpression)
            ->pluck('amount', 'month');

        $monthlyBookings = Booking::query()->visibleToAdmin($includeArchived)
            ->selectRaw("{$monthExpression} as month, COUNT(*) as count")
            ->whereYear('created_at', $year)
            ->groupByRaw($monthExpression)
            ->pluck('count', 'month');

        $topVehicles = Booking::query()->visibleToAdmin($includeArchived)
            ->join('vehicles', 'vehicles.id', '=', 'bookings.vehicle_id')
            ->select('vehicles.id', 'vehicles.name', 'vehicles.brand', 'vehicles.model', 'vehicles.year')
            ->selectRaw('SUM(bookings.total_amount) as revenue')
            ->whereIn('bookings.status', $revenueStatuses)
            ->groupBy('vehicles.id', 'vehicles.name', 'vehicles.brand', 'vehicles.model', 'vehicles.year')
            ->orderByDesc('revenue')
            ->limit(5)
            ->get();

        $upcomingBookings = Booking::visibleToAdmin($includeArchived)->with(['customer', 'vehicle.images'])
            ->whereIn('status', [Booking::PENDING, Booking::UPCOMING])
            ->where('pickup_at', '>=', now())
            ->orderBy('pickup_at')
            ->limit(5)
            ->get();

        $totalRevenue = (float) Booking::visibleToAdmin($includeArchived)->whereIn('status', $revenueStatuses)->sum('total_amount');
        $totalExpenses = (float) Expense::sum('amount');

        return [
            'year' => $year,
            'summary' => $summary,
            'financial' => [
                'total_bookings' => Booking::visibleToAdmin($includeArchived)->count(),
                'total_revenue' => $totalRevenue,
                'total_expenses' => $totalExpenses,
                'total_profit' => $totalRevenue - $totalExpenses,
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
