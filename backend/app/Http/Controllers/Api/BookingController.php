<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Vehicle;
use App\Models\FundTransaction;
use App\Models\FleetSetting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use App\Services\PushNotificationService;
use App\Services\PayMongoService;

class BookingController extends Controller
{
    public function customerIndex(Request $request)
    {
        Booking::synchronizeAutomaticStatuses();
        $customer = $this->authenticatedCustomer($request);

        return Booking::with(['vehicle.images'])
            ->where('customer_id', $customer->id)
            ->latest('pickup_at')
            ->paginate(min(100, max(1, (int) $request->input('per_page', 15))));
    }

    public function customerShow(Request $request, Booking $booking)
    {
        $customer = $this->authenticatedCustomer($request);
        abort_unless($booking->customer_id === $customer->id, 404);

        return $booking->load(['vehicle.images', 'payments.fund', 'statusHistory.user']);
    }

    public function customerPayment(Request $request, Booking $booking)
    {
        $customer = $this->authenticatedCustomer($request);
        abort_unless($booking->customer_id === $customer->id, 404);
        abort_if(in_array($booking->status, [Booking::CANCELLED, Booking::REJECTED], true), 422, 'Cancelled or rejected bookings cannot receive payments.');

        $data = $request->validate(['amount' => ['required', 'numeric', 'min:0.01']]);
        $booking->load('payments');
        $balance = $booking->balance;
        $fleetSettings = FleetSetting::findOrFail(1);
        $minimum = min((float) $fleetSettings->reservation_fee, $balance);
        abort_if((float) $data['amount'] < $minimum || (float) $data['amount'] > $balance, 422, 'Payment must be at least the reservation fee and no more than the remaining balance.');

        $session = app(PayMongoService::class)->createCheckoutSession($booking, (float) $data['amount']);
        $booking->update(['paymongo_checkout_session_id' => $session['id']]);

        return response()->json(['checkout_url' => $session['url']], 201);
    }

    public function customerStore(Request $request)
    {
        $customer = $this->authenticatedCustomer($request);
        $data = $request->validate([
            'vehicle_id' => ['required', 'exists:vehicles,id'],
            'pickup_at' => ['required', 'date', 'after_or_equal:now'],
            'return_at' => ['required', 'date', 'after:pickup_at'],
            'destination' => ['nullable', 'string', 'max:255'],
            'delivery_address' => ['required_if:payment_method,cash_on_delivery', 'nullable', 'string', 'max:255'],
            'delivery_latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'delivery_longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'return_address' => ['nullable', 'string', 'max:255'],
            'return_latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'return_longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'notes' => ['nullable', 'string'],
            'payment_method' => ['required', 'in:cash_on_pickup,cash_on_delivery'],
            'payment_amount' => ['nullable', 'numeric', 'min:0'],
        ]);

        $booking = DB::transaction(function () use ($data, $customer, $request) {
            $paymentAmount = $data['payment_amount'] ?? null;
            unset($data['payment_amount']);
            $vehicle = Vehicle::lockForUpdate()->findOrFail($data['vehicle_id']);
            abort_if(
                $vehicle->status !== 'available'
                    || $vehicle->bookings()->whereIn('status', Booking::ACTIVE_STATUSES)
                        ->where('pickup_at', '<', $data['return_at'])
                        ->where('return_at', '>', $data['pickup_at'])
                        ->exists(),
                422,
                'The vehicle is not available for the selected period.'
            );

            $rentalBreakdown = $this->rentalBreakdown($data['pickup_at'], $data['return_at'], $vehicle, $data['rental_rate'] ?? null);
            $rental = $rentalBreakdown['rental'];
            $fleetSettings = FleetSetting::findOrFail(1);
            $reservationFee = (float) $fleetSettings->reservation_fee;
            $securityDeposit = (float) ($vehicle->security_deposit_fee ?? $vehicle->deposit ?? 0);
            $delivery = $this->deliveryBreakdown($data, $vehicle, $fleetSettings);
            $booking = Booking::create([
                ...$data,
                'customer_id' => $customer->id,
                'reference' => 'CLCH-'.now()->format('Y').'-'.str_pad((string) (Booking::max('id') + 1), 6, '0', STR_PAD_LEFT),
                'status' => Booking::PENDING,
                'payment_status' => 'unpaid',
                'rental_amount' => $rental,
                'additional_charges' => 0,
                ...$delivery,
                'discount' => 0,
                'deposit' => $securityDeposit,
                'extension_fees' => $rentalBreakdown['extension'],
                'total_amount' => $this->totalBeforeDiscount($rental, $reservationFee, $securityDeposit, 0, 0, $rentalBreakdown['extension'], (float) $delivery['delivery_fee'] + (float) $delivery['return_pickup_fee'], $fleetSettings),
                'created_by' => $request->user()->id,
            ]);
            if ($paymentAmount !== null) {
                $minimum = (float) $fleetSettings->reservation_fee;
                abort_if((float) $paymentAmount < $minimum || (float) $paymentAmount > (float) $booking->total_amount, 422, 'Payment must be at least the reservation fee and no more than the booking total.');
            }
            app(PushNotificationService::class)->sendToAdmins(
                'New booking',
                "{$customer->name} submitted {$booking->reference}.",
                "/admin/bookings?booking={$booking->id}",
                "booking-created-{$booking->id}",
            );

            return $booking;
        });

        $paymentAmount = $data['payment_amount'] ?? null;
        if ($paymentAmount !== null) {
            $fleetSettings = FleetSetting::findOrFail(1);
            $minimum = (float) $fleetSettings->reservation_fee;
            $total = (float) $booking->total_amount;
            abort_if($paymentAmount < $minimum || $paymentAmount > $total, 422, 'Payment must be at least the reservation fee and no more than the booking total.');
            $session = app(PayMongoService::class)->createCheckoutSession($booking, (float) $paymentAmount);
            $booking->update(['paymongo_checkout_session_id' => $session['id']]);

            return response()->json([
                ...$booking->load(['vehicle.images'])->toArray(),
                'checkout_url' => $session['url'],
            ], 201);
        }

        return response()->json($booking->load(['vehicle.images']), 201);
    }

    public function index(Request $request)
    {
        Booking::synchronizeAutomaticStatuses();
        $now = now();
        $query = Booking::query()->visibleToAdmin($request->boolean('include_archived'))
            ->with(['customer', 'vehicle.images', 'payments.fund', 'statusHistory.user', 'creator'])
            ->when($request->search, function ($query, $search) {
                $query->where(function ($query) use ($search) {
                    $query->where('reference', 'like', "%{$search}%")
                        ->orWhereHas('customer', fn ($customer) => $customer->where('name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%")->orWhere('phone', 'like', "%{$search}%"))
                        ->orWhereHas('vehicle', fn ($vehicle) => $vehicle->where('name', 'like', "%{$search}%")->orWhere('brand', 'like', "%{$search}%")->orWhere('model', 'like', "%{$search}%")->orWhere('plate_number', 'like', "%{$search}%"));
                });
            })
            ->when($request->filter, function ($query, $filter) use ($now) {
                match ($filter) {
                    'upcoming' => $query->where('status', Booking::UPCOMING),
                    'ongoing' => $query->where('status', Booking::ONGOING),
                    'complete' => $query->where('status', Booking::COMPLETE),
                    'pending' => $query->where('status', Booking::PENDING),
                    'rejected' => $query->where('status', Booking::REJECTED),
                    'cancelled' => $query->where('status', Booking::CANCELLED),
                    default => null,
                };
            });

        $sort = $request->input('sort', 'priority');
        if (in_array($sort, ['latest', 'oldest'], true)) {
            return $query
                ->orderBy('pickup_at', $sort === 'oldest' ? 'asc' : 'desc')
                ->orderBy('id', 'desc')
                ->paginate(min(100, max(1, (int) $request->input('per_page', 15))));
        }

        return $query
            ->orderByRaw("CASE
                WHEN status = 'pending' THEN 0
                WHEN status = 'upcoming' THEN 1
                WHEN status = 'ongoing' THEN 2
                WHEN status = 'complete' THEN 3
                WHEN status = 'rejected' THEN 4
                WHEN status = 'cancelled' THEN 5
                ELSE 6
            END")
            ->orderBy('pickup_at', 'asc')
            ->orderBy('id', 'asc')
            ->paginate(min(100, max(1, (int) $request->input('per_page', 15))));
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->rules());
        $payments = $data['payments'] ?? [];
        unset($data['payments']);

        return DB::transaction(function () use ($data, $payments, $request) {
            $vehicle = Vehicle::lockForUpdate()->findOrFail($data['vehicle_id']);
            abort_if($vehicle->status !== 'available' || $vehicle->bookings()->whereIn('status', Booking::ACTIVE_STATUSES)->where('pickup_at', '<', $data['return_at'])->where('return_at', '>', $data['pickup_at'])->exists(), 422, 'The vehicle is not available for the selected period.');
            $rentalBreakdown = $this->rentalBreakdown($data['pickup_at'], $data['return_at'], $vehicle, $data['rental_rate'] ?? null);
            $rental = $rentalBreakdown['rental'];
            $fleetSettings = FleetSetting::findOrFail(1);
            $reservationFee = (float) $fleetSettings->reservation_fee;
            $securityDeposit = (float) ($vehicle->security_deposit_fee ?? $vehicle->deposit ?? 0);
            $deposit = (float) ($data['deposit'] ?? $securityDeposit);
            $fees = collect(['fuel_charge', 'rfid_charge', 'damage_fees', 'car_wash_fees'])->sum(fn ($fee) => (float) ($data[$fee] ?? 0));
            $extensionFees = array_key_exists('extension_fees', $data) ? (float) $data['extension_fees'] : $rentalBreakdown['extension'];
            $delivery = $this->deliveryBreakdown($data, $vehicle, $fleetSettings);
            $total = $this->totalBeforeDiscount($rental, $reservationFee, $securityDeposit, (float) ($data['additional_charges'] ?? 0), $fees, $extensionFees, (float) $delivery['delivery_fee'] + (float) $delivery['return_pickup_fee'], $fleetSettings) - (float) ($data['discount'] ?? 0);
            $booking = Booking::create([...$data, ...$delivery, 'status' => Booking::UPCOMING, 'extension_fees' => $extensionFees, 'reference' => 'CLCH-'.now()->format('Y').'-'.str_pad((string) (Booking::max('id') + 1), 6, '0', STR_PAD_LEFT), 'rental_amount' => $rental, 'total_amount' => max(0, $total), 'deposit' => $deposit, 'created_by' => $request->user()?->id]);
            $this->syncPayments($booking, $payments);
            $booking->load(['customer', 'creator']);
            $customerName = $booking->customer?->name ?? 'A customer';
            app(PushNotificationService::class)->sendToAdmins(
                'Booking created',
                sprintf('%s created %s.', $booking->creator?->name ?? 'A staff member', $booking->reference),
                "/admin/bookings?booking={$booking->id}",
                "booking-created-{$booking->id}",
            );

            return response()->json($booking->load(['customer', 'vehicle.images', 'payments.fund', 'statusHistory.user']), 201);
        });
    }

    public function show(Booking $booking)
    {
        Booking::synchronizeAutomaticStatuses();
        $booking = $booking->fresh();
        abort_unless(request()->boolean('include_archived') || ! $booking->customer?->archived_at, 404);
        return $booking->load([
            'customer.attachments',
            'customer.user:id,name,first_name,middle_name,last_name,date_of_birth,username,email',
            'vehicle.images',
            'creator',
            'payments.fund',
            'statusHistory.user',
        ]);
    }

    public function invoice(Request $request, Booking $booking)
    {
        Booking::synchronizeAutomaticStatuses();
        $booking->load(['customer', 'vehicle', 'payments']);

        $authenticatedCustomer = $request->user()?->customer;
        abort_unless(! $authenticatedCustomer || $booking->customer_id === $authenticatedCustomer->id, 403);

        $escape = static fn (?string $value): string => e($value ?? '—');
        $money = static fn (float $value): string => '₱'.number_format($value, 2);
        $paid = (float) $booking->payments->sum(fn ($payment) => (float) $payment->amount);
        $balance = max(0, (float) $booking->total_amount - $paid);
        $vehicleName = $booking->vehicle
            ? trim(($booking->vehicle->name ? $booking->vehicle->name.' - ' : '').$booking->vehicle->brand.' '.$booking->vehicle->model)
            : '—';
        $rentalDays = max(1, intdiv($booking->pickup_at->diffInMinutes($booking->return_at), 24 * 60));
        $dailyRate = (float) ($booking->rental_rate ?? $booking->vehicle?->daily_rate ?? 0);
        $deliveryRate = (float) ($booking->delivery_rate_per_km ?? 0);
        $deliveryDistance = (float) ($booking->delivery_distance_km ?? 0);
        $returnDistance = (float) ($booking->return_distance_km ?? 0);
        $lineItems = [
            ['Rental fees ('.$money($dailyRate).' daily rate × '.$rentalDays.' '.($rentalDays === 1 ? 'day' : 'days').')', (float) $booking->rental_amount],
            ['Additional charges', (float) $booking->additional_charges],
            ['Delivery fee ('.$money($deliveryRate).'/km × '.number_format($deliveryDistance, 2).' km)', (float) $booking->delivery_fee],
            ['Return pickup fee ('.$money($deliveryRate).'/km × '.number_format($returnDistance, 2).' km × 2)', (float) $booking->return_pickup_fee],
            ['Fuel charge', (float) $booking->fuel_charge],
            ['RFID charge', (float) $booking->rfid_charge],
            ['Damage fees', (float) $booking->damage_fees],
            ['Car wash fees', (float) $booking->car_wash_fees],
            ['Extension fees (additional rental time)', (float) $booking->extension_fees],
            ['Discount', -((float) $booking->discount)],
            ['Security deposit', (float) $booking->deposit],
        ];
        $lineItemsHtml = collect($lineItems)
            ->filter(fn (array $item) => $item[1] != 0)
            ->map(fn (array $item) => '<tr><td>'.e($item[0]).'</td><td class="amount">'.($item[1] < 0 ? '-' : '').$money(abs($item[1])).'</td></tr>')
            ->implode('');
        $paymentsHtml = $booking->payments
            ->sortBy('paid_at')
            ->map(fn ($payment) => '<tr><td>'.e($payment->paid_at?->format('M j, Y') ?? '—').'</td><td>'.e($payment->notes ?: 'Payment').'</td><td class="amount">'.$money((float) $payment->amount).'</td></tr>')
            ->implode('');
        $invoiceNumber = 'INV-'.$booking->reference;

        $html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'.e($invoiceNumber).' · CL CarHub</title><style>
            :root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f5f5f3;color:#171717;font:14px Arial,sans-serif}.sheet{max-width:820px;margin:32px auto;background:#fff;padding:48px;box-shadow:0 8px 30px #00000012}.header{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #ff641f;padding-bottom:24px}.brand{font-size:24px;font-weight:700}.muted{color:#666}.label{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#777}.grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:28px 0}.details{line-height:1.7}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{padding:10px 0;border-bottom:1px solid #e5e5e5;text-align:left}th{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#777}.amount{text-align:right;white-space:nowrap}.totals{margin-left:auto;max-width:300px;margin-top:24px}.totals div{display:flex;justify-content:space-between;padding:7px 0}.grand{border-top:2px solid #171717;font-size:18px;font-weight:700;margin-top:6px;padding-top:12px!important}.balance{color:#d94f12}.actions{display:flex;justify-content:flex-end;gap:10px;margin-bottom:16px}.button{border:1px solid #ddd;background:#fff;padding:10px 16px;cursor:pointer}.button.primary{background:#ff641f;border-color:#ff641f;color:#fff;font-weight:700}@media print{body{background:#fff}.sheet{margin:0;max-width:none;padding:0;box-shadow:none}.actions{display:none}}@media(max-width:600px){.sheet{margin:0;padding:24px}.header,.grid{display:block}.header>div+div{margin-top:20px}.totals{max-width:none}}
        </style></head><body><main class="sheet"><div class="actions"><button class="button" onclick="window.close()">Close</button><button class="button primary" onclick="window.print()">Print / Save PDF</button></div><header class="header"><div><div class="brand">CL CarHub</div><div class="muted">Vehicle rental invoice</div></div><div><div class="label">Invoice</div><strong>'.e($invoiceNumber).'</strong><div class="muted">'.e(now()->format('M j, Y')).'</div></div></header><section class="grid"><div class="details"><div class="label">Bill to</div><strong>'.e($booking->customer?->name).'</strong><br>'.($booking->customer?->email ? e($booking->customer->email).'<br>' : '').e($booking->customer?->phone ?? '').'</div><div class="details"><div class="label">Booking</div><strong>'.e($booking->reference).'</strong><br>'.e($vehicleName).'<br>'.e($booking->vehicle?->plate_number).'<br>'.e($booking->pickup_at?->format('M j, Y g:i A')).' – '.e($booking->return_at?->format('M j, Y g:i A')).'</div></section><section><div class="label">Charges</div><table><thead><tr><th>Description</th><th class="amount">Amount</th></tr></thead><tbody>'.$lineItemsHtml.'</tbody></table><div class="totals"><div><span>Total</span><strong>'.$money((float) $booking->total_amount).'</strong></div><div><span>Paid</span><span>'.$money($paid).'</span></div><div class="grand balance"><span>Balance due</span><span>'.$money($balance).'</span></div></div></section><section style="margin-top:34px"><div class="label">Payments received</div><table><thead><tr><th>Date</th><th>Notes</th><th class="amount">Amount</th></tr></thead><tbody>'.($paymentsHtml ?: '<tr><td colspan="3" class="muted">No payments recorded.</td></tr>').'</tbody></table></section><p class="muted" style="margin-top:36px">Thank you for choosing CL CarHub.</p></main></body></html>';

        return response($html)->header('Content-Type', 'text/html; charset=UTF-8')->header('Content-Disposition', 'inline; filename="'.$invoiceNumber.'.html"')->header('Cache-Control', 'no-store');
    }

    public function update(Request $request, Booking $booking)
    {
        Booking::synchronizeAutomaticStatuses();
        $data = $request->validate($this->rules(true));
        $oldStatus = $booking->status;
        $reason = $data['status_reason'] ?? null;
        if (array_key_exists('status', $data) && $data['status'] !== $oldStatus) {
            abort_unless(in_array($data['status'], $this->allowedStatusTransitions()[$booking->status] ?? [], true), 422, "A {$booking->status} booking cannot be changed to {$data['status']}.");
            if (in_array($data['status'], [Booking::CANCELLED, Booking::REJECTED], true)) {
                abort_if(blank($reason), 422, 'A reason is required when cancelling or rejecting a booking.');
            }
        }
        unset($data['status_reason']);
        $payments = $data['payments'] ?? null;
        unset($data['payments']);
        $vehicle = Vehicle::findOrFail($data['vehicle_id'] ?? $booking->vehicle_id);
        $fleetSettings = FleetSetting::findOrFail(1);
        if (array_key_exists('delivery_address', $data) || array_key_exists('delivery_latitude', $data) || array_key_exists('delivery_longitude', $data) || array_key_exists('return_address', $data) || array_key_exists('return_latitude', $data) || array_key_exists('return_longitude', $data) || array_key_exists('payment_method', $data) || array_key_exists('vehicle_id', $data)) {
            $data = [...$data, ...$this->deliveryBreakdown([...$booking->toArray(), ...$data], $vehicle, $fleetSettings)];
        }
        $booking->update($data);
        if (array_key_exists('status', $data) && $data['status'] !== $oldStatus) {
            $booking->statusHistory()->create(['from_status' => $oldStatus, 'to_status' => $booking->status, 'reason' => $reason, 'changed_by' => $request->user()?->id]);
        }
        $booking->refresh();
        $rentalBreakdown = $this->rentalBreakdown($booking->pickup_at, $booking->return_at, $vehicle, $booking->rental_rate);
        $booking->rental_amount = $rentalBreakdown['rental'];
        if (! array_key_exists('extension_fees', $data)) {
            $booking->extension_fees = $rentalBreakdown['extension'];
        }
        $booking->deposit = (float) ($vehicle->security_deposit_fee ?? $vehicle->deposit ?? 0);
        $booking->save();
        $this->recalculateTotal($booking);
        if ($payments !== null) $this->syncPayments($booking, $payments);
        if ($oldStatus !== $booking->status) {
            $booking->load('customer');
            app(PushNotificationService::class)->sendToAdmins(
                "Booking {$booking->status}",
                "{$booking->reference} was marked {$booking->status}.",
                "/admin/bookings?booking={$booking->id}",
                "booking-{$booking->status}-{$booking->id}",
            );
        }

        return $booking->fresh(['customer', 'vehicle.images', 'payments.fund', 'statusHistory.user']);
    }

    public function destroy(Booking $booking)
    {
        $booking->update(['status' => 'cancelled']);

        return response()->noContent();
    }

    private function rules(bool $updating = false): array
    {
        $pickupRule = $updating ? ['sometimes', 'date'] : ['required', 'date', 'after_or_equal:now'];
        $returnRule = $updating ? ['sometimes', 'date', 'after:pickup_at'] : ['required', 'date', 'after:pickup_at'];
        return ['customer_id' => [$updating ? 'sometimes' : 'required', 'exists:customers,id'], 'vehicle_id' => [$updating ? 'sometimes' : 'required', 'exists:vehicles,id'], 'pickup_at' => $pickupRule, 'return_at' => $returnRule, 'rental_rate' => ['nullable', 'numeric', 'min:0'], 'destination' => ['nullable', 'string', 'max:255'], 'delivery_address' => ['nullable', 'string', 'max:255'], 'delivery_latitude' => ['nullable', 'numeric', 'between:-90,90'], 'delivery_longitude' => ['nullable', 'numeric', 'between:-180,180'], 'delivery_distance_km' => ['nullable', 'numeric', 'min:0'], 'delivery_rate_per_km' => ['nullable', 'numeric', 'min:0'], 'delivery_fee' => ['nullable', 'numeric', 'min:0'], 'return_address' => ['nullable', 'string', 'max:255'], 'return_latitude' => ['nullable', 'numeric', 'between:-90,90'], 'return_longitude' => ['nullable', 'numeric', 'between:-180,180'], 'return_distance_km' => ['nullable', 'numeric', 'min:0'], 'return_pickup_fee' => ['nullable', 'numeric', 'min:0'], 'payment_method' => ['nullable', 'in:cash_on_pickup,cash_on_delivery'], 'notes' => ['nullable', 'string'], 'additional_charges' => ['nullable', 'numeric', 'min:0'], 'discount' => ['nullable', 'numeric', 'min:0'], 'deposit' => ['nullable', 'numeric', 'min:0'], 'fuel_charge' => ['nullable', 'numeric', 'min:0'], 'rfid_charge' => ['nullable', 'numeric', 'min:0'], 'damage_fees' => ['nullable', 'numeric', 'min:0'], 'car_wash_fees' => ['nullable', 'numeric', 'min:0'], 'extension_fees' => ['nullable', 'numeric', 'min:0'], 'status' => ['sometimes', 'in:pending,upcoming,ongoing,complete,rejected,cancelled'], 'status_reason' => ['nullable', 'string', 'max:1000'], 'payment_status' => ['sometimes', 'in:unpaid,partial,paid,refunded'], 'payments' => ['nullable', 'array'], 'payments.*.amount' => ['required', 'numeric', 'min:0'], 'payments.*.fund_id' => ['nullable', 'exists:funds,id'], 'payments.*.notes' => ['nullable', 'string'], 'payments.*.paid_at' => ['required', 'date']];
    }

    private function authenticatedCustomer(Request $request)
    {
        $customer = $request->user()?->customer;
        abort_unless($customer, 403, 'Your account is not linked to a customer profile.');

        return $customer;
    }

    private function allowedStatusTransitions(): array
    {
        return [
            Booking::PENDING => [Booking::UPCOMING, Booking::CANCELLED, Booking::REJECTED],
            Booking::UPCOMING => [Booking::CANCELLED],
            Booking::ONGOING => [Booking::COMPLETE],
            Booking::COMPLETE => [],
            Booking::CANCELLED => [],
            Booking::REJECTED => [],
        ];
    }

    private function syncPayments(Booking $booking, array $payments): void
    {
        $booking->payments()->whereNull('provider')->delete();
        foreach ($payments as $payment) {
            $createdPayment = $booking->payments()->create(['amount' => $payment['amount'], 'fund_id' => $payment['fund_id'] ?? null, 'notes' => $payment['notes'] ?? null, 'paid_at' => $payment['paid_at'], 'payment_method' => null, 'status' => 'paid']);
            if ($createdPayment->fund_id) {
                FundTransaction::create([
                    'fund_id' => $createdPayment->fund_id,
                    'payment_id' => $createdPayment->id,
                    'type' => 'inflow',
                    'transacted_at' => $createdPayment->paid_at ?? now(),
                    'amount' => $createdPayment->amount,
                    'description' => "Booking payment {$booking->reference}",
                    'notes' => $createdPayment->notes,
                    'created_by' => $booking->created_by,
                ]);
            }
        }
    }

    private function recalculateTotal(Booking $booking): void
    {
        $vehicle = $booking->vehicle()->firstOrFail();
        $fleetSettings = FleetSetting::findOrFail(1);
        $fees = collect(['fuel_charge', 'rfid_charge', 'damage_fees', 'car_wash_fees'])->sum(fn ($fee) => (float) $booking->{$fee});
        $reservationFee = (float) $fleetSettings->reservation_fee;
        $securityDeposit = (float) ($vehicle->security_deposit_fee ?? $booking->deposit ?? $vehicle->deposit ?? 0);
        $booking->update(['total_amount' => max(0, $this->totalBeforeDiscount((float) $booking->rental_amount, $reservationFee, $securityDeposit, (float) $booking->additional_charges, $fees, (float) $booking->extension_fees, (float) $booking->delivery_fee + (float) $booking->return_pickup_fee, $fleetSettings) - (float) $booking->discount)]);
    }

    private function totalBeforeDiscount(float $rental, float $reservationFee, float $securityDeposit, float $additionalCharges, float $fees, float $extensionFees, float $deliveryFee, FleetSetting $settings): float
    {
        return $rental + $additionalCharges + $fees + $extensionFees + $deliveryFee + $securityDeposit + ($settings->reservation_fee_deductible ? 0 : $reservationFee);
    }

    private function deliveryBreakdown(array $data, Vehicle $vehicle, FleetSetting $settings): array
    {
        $originLat = $settings->garage_location_latitude;
        $originLon = $settings->garage_location_longitude;
        $hasDelivery = $this->hasCoordinates($data, 'delivery_latitude', 'delivery_longitude');
        $hasReturnPickup = $this->hasCoordinates($data, 'return_latitude', 'return_longitude');
        if (! $hasDelivery && ! $hasReturnPickup) {
            return ['delivery_distance_km' => null, 'delivery_rate_per_km' => null, 'delivery_fee' => 0, 'delivery_latitude' => null, 'delivery_longitude' => null, 'return_distance_km' => null, 'return_pickup_fee' => 0];
        }
        abort_if($originLat === null || $originLon === null, 422, 'Delivery fees are not available because the garage location has not been configured.');
        $vehicleRate = $vehicle->delivery_rate_per_km === null ? null : (float) $vehicle->delivery_rate_per_km;
        $rate = $vehicleRate !== null && $vehicleRate > 0
            ? $vehicleRate
            : (float) $settings->default_delivery_rate_per_km;

        $routeDistance = function (float $latitude, float $longitude, string $error) use ($originLat, $originLon): float {
            $route = Http::withOptions(['verify' => env('ROUTING_CA_BUNDLE', true)])
                ->timeout(8)
                ->get("https://router.project-osrm.org/route/v1/driving/{$originLon},{$originLat};{$longitude},{$latitude}", ['overview' => 'false']);
            abort_unless($route->successful() && $route->json('code') === 'Ok', 422, $error);

            return round(((float) $route->json('routes.0.distance')) / 1000, 2);
        };
        $deliveryDistance = $hasDelivery
            ? $routeDistance((float) $data['delivery_latitude'], (float) $data['delivery_longitude'], 'Unable to calculate the delivery distance. Please try another location.')
            : null;
        $returnDistance = $hasReturnPickup
            ? $routeDistance((float) $data['return_latitude'], (float) $data['return_longitude'], 'Unable to calculate the return pickup distance. Please try another location.')
            : null;

        return ['delivery_distance_km' => $deliveryDistance, 'delivery_rate_per_km' => $rate, 'delivery_fee' => $deliveryDistance === null ? 0 : round($deliveryDistance * $rate, 2), 'delivery_latitude' => $hasDelivery ? (float) $data['delivery_latitude'] : null, 'delivery_longitude' => $hasDelivery ? (float) $data['delivery_longitude'] : null, 'return_distance_km' => $returnDistance, 'return_pickup_fee' => $returnDistance === null ? 0 : round($returnDistance * 2 * $rate, 2)];
    }

    private function hasCoordinates(array $data, string $latitudeKey, string $longitudeKey): bool
    {
        return array_key_exists($latitudeKey, $data)
            && array_key_exists($longitudeKey, $data)
            && is_numeric($data[$latitudeKey])
            && is_numeric($data[$longitudeKey]);
    }

    private function rentalBreakdown(Carbon|string $pickupAt, Carbon|string $returnAt, Vehicle $vehicle, float|string|null $rentalRate = null): array
    {
        $pickupAt = $pickupAt instanceof Carbon ? $pickupAt : Carbon::parse($pickupAt);
        $returnAt = $returnAt instanceof Carbon ? $returnAt : Carbon::parse($returnAt);
        $minutes = $pickupAt->diffInMinutes($returnAt);
        $days = intdiv($minutes, 24 * 60);
        $settings = FleetSetting::findOrFail(1);
        $remainingMinutes = $minutes % (24 * 60);
        $billableMinutes = max(0, $remainingMinutes - (int) $settings->late_return_grace_period_minutes);
        $remainingHours = (int) ceil($billableMinutes / 60);
        $hourlyRate = (float) ($vehicle->hour_extension_rate ?? $settings->default_hour_extension_rate);
        $dailyRate = $rentalRate === null ? (float) $vehicle->daily_rate : (float) $rentalRate;
        $extension = $remainingHours === 0 ? 0 : ($remainingHours >= $settings->full_day_extension_threshold_hours ? $dailyRate : $remainingHours * $hourlyRate);

        return ['rental' => max(1, $days) * $dailyRate, 'extension' => $extension];
    }
}
