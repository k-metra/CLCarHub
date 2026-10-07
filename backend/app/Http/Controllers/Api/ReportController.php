<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Vehicle;
use App\Models\Fund;
use App\Models\FundTransaction;
use Carbon\Carbon;
use Illuminate\Http\Request;

class ReportController extends Controller
{
    public function revenue(Request $request)
    {
        Booking::synchronizeAutomaticStatuses();
        $bookings = Booking::visibleToAdmin($request->boolean('include_archived'))->whereIn('status', [Booking::ONGOING, Booking::COMPLETE])->when($request->from, fn ($q, $v) => $q->whereDate('created_at', '>=', $v))->when($request->to, fn ($q, $v) => $q->whereDate('created_at', '<=', $v));

        return ['total_revenue' => (float) $bookings->sum('total_amount'), 'booking_count' => $bookings->count()];
    }

    public function utilization(Request $request)
    {
        Booking::synchronizeAutomaticStatuses();
        $periodStart = Carbon::parse($request->input('from', now()->startOfMonth()->toDateString()))->startOfDay();
        $periodEnd = Carbon::parse($request->input('to', now()->endOfMonth()->toDateString()))->endOfDay();
        abort_if($periodEnd->lt($periodStart), 422, 'The end date must be on or after the start date.');

        $statuses = [Booking::UPCOMING, Booking::ONGOING, Booking::COMPLETE];
        $vehicles = Vehicle::with(['partner', 'images', 'bookings' => function ($query) use ($periodStart, $periodEnd, $statuses) {
            $query->visibleToAdmin($request->boolean('include_archived'))->whereIn('status', $statuses)
                ->where('pickup_at', '<', $periodEnd)
                ->where('return_at', '>', $periodStart)
                ->orderBy('pickup_at');
        }])
            ->where('status', '!=', 'archived')
            ->when($request->type, fn ($query, $value) => $query->where('type', $value))
            ->when($request->partner_id === 'none', fn ($query) => $query->whereNull('partner_id'))
            ->when($request->partner_id && $request->partner_id !== 'none', fn ($query, $value) => $query->where('partner_id', $value))
            ->when($request->search, function ($query, $search) {
                $query->where(function ($vehicle) use ($search) {
                    $vehicle->where('name', 'like', "%{$search}%")
                        ->orWhere('brand', 'like', "%{$search}%")
                        ->orWhere('model', 'like', "%{$search}%")
                        ->orWhere('plate_number', 'like', "%{$search}%")
                        ->orWhereHas('partner', fn ($partner) => $partner->where('name', 'like', "%{$search}%"));
                });
            })
            ->get();

        $availableDays = $periodStart->copy()->startOfDay()->diffInDays($periodEnd->copy()->startOfDay()) + 1;
        $rows = $vehicles->map(function ($vehicle) use ($periodStart, $periodEnd, $availableDays) {
            $intervals = $vehicle->bookings->map(function ($booking) use ($periodStart, $periodEnd) {
                $start = $booking->pickup_at->greaterThan($periodStart) ? $booking->pickup_at->copy() : $periodStart->copy();
                $end = $booking->return_at->lessThan($periodEnd) ? $booking->return_at->copy() : $periodEnd->copy();

                return [$start->startOfDay(), $end->startOfDay()];
            })->sortBy(fn ($interval) => $interval[0]->timestamp)->values();
            $bookedDays = 0;
            $currentEnd = null;
            foreach ($intervals as [$start, $end]) {
                if ($currentEnd === null || $start->gt($currentEnd->copy()->addDay())) {
                    $bookedDays += $start->diffInDays($end) + 1;
                    $currentEnd = $end;
                } elseif ($end->gt($currentEnd)) {
                    $bookedDays += $currentEnd->diffInDays($end);
                    $currentEnd = $end;
                }
            }

            return [
                'vehicle' => $vehicle,
                'booking_count' => $vehicle->bookings->count(),
                'available_days' => $availableDays,
                'booked_days' => $bookedDays,
                'idle_days' => max(0, $availableDays - $bookedDays),
                'utilization_rate' => round(($bookedDays / $availableDays) * 100, 2),
                'average_rental_days' => $vehicle->bookings->count() ? round($vehicle->bookings->avg(fn ($booking) => $booking->pickup_at->diffInHours($booking->return_at) / 24), 2) : 0,
            ];
        })->values();

        $rows = match ($request->input('sort', 'utilization_desc')) {
            'utilization_asc' => $rows->sortBy('utilization_rate')->values(),
            'bookings_desc' => $rows->sortByDesc('booking_count')->values(),
            'bookings_asc' => $rows->sortBy('booking_count')->values(),
            'booked_days_desc' => $rows->sortByDesc('booked_days')->values(),
            'booked_days_asc' => $rows->sortBy('booked_days')->values(),
            'name_asc' => $rows->sortBy(fn ($row) => strtolower((string) ($row['vehicle']->name ?? (($row['vehicle']->brand ?? '').' '.($row['vehicle']->model ?? '')))))->values(),
            default => $rows->sortByDesc('utilization_rate')->values(),
        };

        if ($request->boolean('csv')) {
            $lines = [['Vehicle', 'Plate Number', 'Partner', 'Bookings', 'Available Days', 'Booked Days', 'Idle Days', 'Utilization Rate', 'Average Rental Days']];
            foreach ($rows as $row) {
                $vehicle = $row['vehicle'];
                $lines[] = [
                    $vehicle?->name ?: trim(($vehicle?->brand ?? '').' '.($vehicle?->model ?? '')),
                    $vehicle?->plate_number ?? '',
                    $vehicle?->partner?->name ?? '',
                    $row['booking_count'],
                    $row['available_days'],
                    $row['booked_days'],
                    $row['idle_days'],
                    number_format($row['utilization_rate'], 2, '.', '').'%',
                    number_format($row['average_rental_days'], 2, '.', ''),
                ];
            }

            return response(collect($lines)->map(fn ($line) => collect($line)->map(fn ($value) => '"'.str_replace('"', '""', (string) $value).'"')->implode(','))->implode("\r\n"), 200, [
                'Content-Type' => 'text/csv',
                'Content-Disposition' => 'attachment; filename="fleet-utilization.csv"',
            ]);
        }

        return [
            'from' => $periodStart->toDateString(),
            'to' => $periodEnd->toDateString(),
            'available_days' => $availableDays,
            'vehicles' => $rows,
            'vehicle_count' => $rows->count(),
            'booking_count' => $rows->sum('booking_count'),
            'booked_days' => $rows->sum('booked_days'),
            'idle_days' => $rows->sum('idle_days'),
            'average_utilization' => $rows->count() ? round($rows->avg('utilization_rate'), 2) : 0,
            'partners' => \App\Models\Partner::orderBy('name')->get(['id', 'name']),
        ];
    }

    public function vehicleRevenue(Request $request)
    {
        Booking::synchronizeAutomaticStatuses();
        $activeStatuses = [Booking::UPCOMING, Booking::ONGOING, Booking::COMPLETE];
        $status = $request->input('status');
        $bookings = Booking::visibleToAdmin($request->boolean('include_archived'))->with(['vehicle.partner', 'vehicle.images', 'payments', 'customer'])
            ->whereIn('status', $status ? [$status] : $activeStatuses)
            ->when($request->from, fn ($q, $value) => $q->whereDate('pickup_at', '>=', $value))
            ->when($request->to, fn ($q, $value) => $q->whereDate('pickup_at', '<=', $value))
            ->when($request->search, function ($q, $search) {
                $q->where(function ($query) use ($search) {
                    $query->where('reference', 'like', "%{$search}%")
                        ->orWhereHas('customer', fn ($customer) => $customer->where('name', 'like', "%{$search}%"))
                        ->orWhereHas('vehicle', fn ($vehicle) => $vehicle
                            ->where('name', 'like', "%{$search}%")
                            ->orWhere('brand', 'like', "%{$search}%")
                            ->orWhere('model', 'like', "%{$search}%")
                            ->orWhere('plate_number', 'like', "%{$search}%")
                            ->orWhereHas('partner', fn ($partner) => $partner->where('name', 'like', "%{$search}%")));
                });
            })
            ->get();

        $vehicles = $bookings->groupBy('vehicle_id')->map(function ($vehicleBookings) {
            $vehicle = $vehicleBookings->first()->vehicle;
            $bookingRevenue = (float) $vehicleBookings->sum('total_amount');
            $collected = (float) $vehicleBookings->sum(fn ($booking) => $booking->payments->sum('amount'));

            return [
                'vehicle' => $vehicle,
                'booking_count' => $vehicleBookings->count(),
                'booking_revenue' => $bookingRevenue,
                'collected_revenue' => $collected,
                'outstanding_revenue' => max(0, $bookingRevenue - $collected),
            ];
        })->values();

        $vehicles = match ($request->input('sort', 'revenue_desc')) {
            'revenue_asc' => $vehicles->sortBy('booking_revenue')->values(),
            'collected_desc' => $vehicles->sortByDesc('collected_revenue')->values(),
            'collected_asc' => $vehicles->sortBy('collected_revenue')->values(),
            'bookings_desc' => $vehicles->sortByDesc('booking_count')->values(),
            'bookings_asc' => $vehicles->sortBy('booking_count')->values(),
            'name_asc' => $vehicles->sortBy(fn ($row) => strtolower((string) ($row['vehicle']->name ?? (($row['vehicle']->brand ?? '').' '.($row['vehicle']->model ?? '')))))->values(),
            default => $vehicles->sortByDesc('booking_revenue')->values(),
        };

        if ($request->boolean('csv')) {
            $lines = [['Vehicle', 'Plate Number', 'Partner', 'Bookings', 'Booking Revenue', 'Collected Revenue', 'Outstanding Revenue']];
            foreach ($vehicles as $row) {
                $vehicle = $row['vehicle'];
                $lines[] = [
                    $vehicle?->name ?: trim(($vehicle?->brand ?? '').' '.($vehicle?->model ?? '')),
                    $vehicle?->plate_number ?? '',
                    $vehicle?->partner?->name ?? '',
                    $row['booking_count'],
                    number_format($row['booking_revenue'], 2, '.', ''),
                    number_format($row['collected_revenue'], 2, '.', ''),
                    number_format($row['outstanding_revenue'], 2, '.', ''),
                ];
            }

            return response(collect($lines)->map(fn ($line) => collect($line)->map(fn ($value) => '"'.str_replace('"', '""', (string) $value).'"')->implode(','))->implode("\r\n"), 200, [
                'Content-Type' => 'text/csv',
                'Content-Disposition' => 'attachment; filename="vehicle-revenue.csv"',
            ]);
        }

        return [
            'vehicles' => $vehicles,
            'booking_count' => $bookings->count(),
            'vehicle_count' => $vehicles->count(),
            'total_revenue' => (float) $vehicles->sum('booking_revenue'),
            'total_collected' => (float) $vehicles->sum('collected_revenue'),
            'total_outstanding' => (float) $vehicles->sum('outstanding_revenue'),
        ];
    }

    public function incomeFlow(Request $request)
    {
        $query = FundTransaction::with(['fund', 'payment.booking.customer', 'payment.booking.vehicle', 'expense.vehicle'])
            ->when($request->from, fn ($q, $value) => $q->whereDate('transacted_at', '>=', $value))
            ->when($request->to, fn ($q, $value) => $q->whereDate('transacted_at', '<=', $value))
            ->when($request->fund_id, fn ($q, $value) => $q->where('fund_id', $value))
            ->when($request->direction, fn ($q, $value) => $q->where('type', $value))
            ->when($request->source, function ($q, $source) {
                match ($source) {
                    'booking_payment' => $q->whereNotNull('payment_id'),
                    'expense' => $q->whereNotNull('expense_id'),
                    'manual' => $q->whereNull('payment_id')->whereNull('expense_id'),
                    default => null,
                };
            })
            ->when($request->category, function ($q, $category) {
                $q->whereHas('expense', fn ($expense) => $expense->where('category', $category));
            })
            ->when($request->search, function ($q, $search) {
                $q->where(function ($query) use ($search) {
                    $query->where('description', 'like', "%{$search}%")
                        ->orWhere('notes', 'like', "%{$search}%")
                        ->orWhereHas('fund', fn ($fund) => $fund->where('name', 'like', "%{$search}%"))
                        ->orWhereHas('payment.booking', fn ($booking) => $booking->where('reference', 'like', "%{$search}%")
                            ->orWhereHas('customer', fn ($customer) => $customer->where('name', 'like', "%{$search}%"))
                            ->orWhereHas('vehicle', fn ($vehicle) => $vehicle->where('name', 'like', "%{$search}%")->orWhere('brand', 'like', "%{$search}%")->orWhere('model', 'like', "%{$search}%")));
                });
            });

        match ($request->input('sort', 'date_latest')) {
            'date_oldest' => $query->orderBy('transacted_at'),
            'amount_asc' => $query->orderBy('amount'),
            'amount_desc' => $query->orderByDesc('amount'),
            'type_inflow' => $query->orderByRaw("CASE WHEN type = 'inflow' THEN 0 ELSE 1 END")->orderByDesc('transacted_at'),
            'type_outflow' => $query->orderByRaw("CASE WHEN type = 'outflow' THEN 0 ELSE 1 END")->orderByDesc('transacted_at'),
            default => $query->orderByDesc('transacted_at'),
        };

        $transactions = $query->get();
        if ($request->boolean('csv')) {
            $lines = [['Date', 'Fund', 'Direction', 'Source', 'Reference', 'Vehicle / Customer', 'Description', 'Amount']];
            foreach ($transactions as $transaction) {
                $source = $transaction->payment_id ? 'Booking payment' : ($transaction->expense_id ? 'Expense' : 'Manual');
                $reference = $transaction->payment?->booking?->reference ?? ($transaction->expense?->expense_type ?? '');
                $context = $transaction->payment?->booking?->vehicle?->name ?? ($transaction->payment?->booking?->customer?->name ?? ($transaction->expense?->vehicle?->name ?? ''));
                $lines[] = [$transaction->transacted_at->toDateTimeString(), $transaction->fund?->name ?? '', ucfirst($transaction->type), $source, $reference, $context, $transaction->description, number_format((float) $transaction->amount, 2, '.', '')];
            }
            return response(collect($lines)->map(fn ($line) => collect($line)->map(fn ($value) => '"'.str_replace('"', '""', (string) $value).'"')->implode(','))->implode("\r\n"), 200, ['Content-Type' => 'text/csv', 'Content-Disposition' => 'attachment; filename="income-flow.csv"']);
        }

        return [
            'funds' => Fund::orderBy('name')->get(['id', 'name']),
            'transactions' => $transactions,
            'total_income' => (float) $transactions->where('type', 'inflow')->sum('amount'),
            'total_expenses' => (float) $transactions->where('type', 'outflow')->sum('amount'),
            'net_income' => (float) $transactions->where('type', 'inflow')->sum('amount') - (float) $transactions->where('type', 'outflow')->sum('amount'),
            'transaction_count' => $transactions->count(),
        ];
    }
}
