<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Vehicle;
use App\Models\Addon;
use App\Models\FundTransaction;
use App\Models\Fund;
use App\Models\FleetSetting;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Http\UploadedFile;
use App\Services\PushNotificationService;
use App\Models\BookingReturnPhoto;
use App\Models\Customer;
use App\Services\PayMongoService;
use App\Services\DiscountCodeService;
use App\Services\StaffAssignmentSmsService;
use App\Services\PartnerAssignmentSmsService;
use App\Services\PartnerEarningService;

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
        abort_unless(filled($customer->social_profile_url), 422, 'Add a link to one of your active social profiles before booking.');
        $data = $request->validate([
            'vehicle_id' => ['required', 'exists:vehicles,id'],
            'addons' => ['nullable', 'array'],
            'addons.*' => ['integer', 'exists:addons,id'],
            'pickup_at' => ['required', 'date'],
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
            'discount_code' => ['nullable', 'string', 'max:80'],
        ]);

        $booking = DB::transaction(function () use ($data, $customer, $request) {
            $paymentAmount = $data['payment_amount'] ?? null;
            unset($data['payment_amount']);
            $vehicle = Vehicle::lockForUpdate()->findOrFail($data['vehicle_id']);
            abort_unless($vehicle->hasActivePartnerContract(), 422, 'This partner vehicle is not eligible for rental until its contract is approved.');
            abort_if(
                $vehicle->status !== 'available'
                    || $vehicle->bookings()->whereIn('status', Booking::ACTIVE_STATUSES)
                        ->where('pickup_at', '<', $data['return_at'])
                        ->where('return_at', '>', $data['pickup_at'])
                        ->exists(),
                422,
                'The vehicle is not available for the selected period.'
            );

            $rentalBreakdown = $this->rentalBreakdown($data['pickup_at'], $data['return_at'], $vehicle, $data['rental_rate'] ?? null, null);
            $rental = $rentalBreakdown['rental'];
            $discountCode = $this->resolveDiscountCode($data, $customer, $vehicle, $rental);
            $discountCodeAmount = $discountCode ? app(DiscountCodeService::class)->amount($discountCode, (float) $rental) : 0;
            $rental = max(0, $rental - $discountCodeAmount);
            unset($data['discount_code']);
            $addonBreakdown = $this->addonBreakdown($data['addons'] ?? [], $vehicle, $data['pickup_at'], $data['return_at']);
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
                'rental_discount' => $rentalBreakdown['discount'],
                'addons' => $addonBreakdown['items'],
                'additional_charges' => $addonBreakdown['total'],
                ...$delivery,
                'discount' => 0,
                'deposit' => $securityDeposit,
                'extension_fees' => $rentalBreakdown['extension'],
                'total_amount' => $this->totalBeforeDiscount($rental, $reservationFee, $securityDeposit, (float) $addonBreakdown['total'], 0, $rentalBreakdown['extension'], (float) $delivery['delivery_fee'] + (float) $delivery['return_pickup_fee'], $fleetSettings),
                'created_by' => $request->user()->id,
                'discount_code_id' => $discountCode?->id,
                'discount_code_amount' => $discountCodeAmount,
            ]);
            if ($discountCode) {
                app(DiscountCodeService::class)->redeem($discountCode, $customer, $booking, $discountCodeAmount);
            }

            if ($paymentAmount !== null) {
                $minimum = (float) $fleetSettings->reservation_fee;
                $paymentAmount = round((float) $paymentAmount, 2);
                $bookingTotal = round((float) $booking->total_amount, 2);
                abort_if($paymentAmount < round($minimum, 2) || $paymentAmount > $bookingTotal, 422, 'Payment must be at least the reservation fee and no more than the booking total.');
            }
            app(PushNotificationService::class)->sendToAdmins(
                'New booking',
                "{$customer->name} submitted {$booking->reference}.",
                "/admin/bookings?booking={$booking->id}",
                "booking-created-{$booking->id}",
            );
            app(\App\Services\CustomerBookingSmsService::class)->send($booking);

            return $booking;
        });

        $paymentAmount = $data['payment_amount'] ?? null;
        if ($paymentAmount !== null) {
            $fleetSettings = FleetSetting::findOrFail(1);
            $paymentAmount = round((float) $paymentAmount, 2);
            $minimum = round((float) $fleetSettings->reservation_fee, 2);
            $total = round((float) $booking->total_amount, 2);
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

    public function customerDiscountPreview(Request $request)
    {
        $customer = $this->authenticatedCustomer($request);
        $data = $request->validate([
            'vehicle_id' => ['required', 'exists:vehicles,id'],
            'pickup_at' => ['required', 'date'],
            'return_at' => ['required', 'date', 'after:pickup_at'],
            'discount_code' => ['required', 'string', 'max:80'],
        ]);
        $vehicle = Vehicle::findOrFail($data['vehicle_id']);
        $breakdown = $this->rentalBreakdown($data['pickup_at'], $data['return_at'], $vehicle, null, null);
        $durationHours = (int) ceil(Carbon::parse($data['pickup_at'])->diffInMinutes(Carbon::parse($data['return_at'])) / 60);
        $discountCode = app(DiscountCodeService::class)->findEligible($data['discount_code'], $customer, $vehicle, (float) $breakdown['rental'], $durationHours);
        $amount = app(DiscountCodeService::class)->amount($discountCode, (float) $breakdown['rental']);

        return response()->json([
            'code' => $discountCode->code,
            'amount' => $amount,
            'rental_before_discount' => (float) $breakdown['rental'],
            'rental_after_discount' => round(max(0, (float) $breakdown['rental'] - $amount), 2),
        ]);
    }

    public function index(Request $request)
    {
        Booking::synchronizeAutomaticStatuses();
        $now = now();
        $query = Booking::query()->visibleToAdmin($request->boolean('include_archived'))
            ->with(['customer', 'vehicle.images', 'payments.fund', 'statusHistory.user', 'creator', 'assignedTo'])
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
                    'for_completion' => $query->where('status', Booking::FOR_COMPLETION),
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
                WHEN status = 'for_completion' THEN 1
                WHEN status = 'upcoming' THEN 2
                WHEN status = 'ongoing' THEN 3
                WHEN status = 'complete' THEN 4
                WHEN status = 'rejected' THEN 5
                WHEN status = 'cancelled' THEN 6
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
            abort_unless($vehicle->hasActivePartnerContract(), 422, 'This partner vehicle is not eligible for rental until its contract is approved.');
            abort_if($vehicle->status !== 'available' || $vehicle->bookings()->whereIn('status', Booking::ACTIVE_STATUSES)->where('pickup_at', '<', $data['return_at'])->where('return_at', '>', $data['pickup_at'])->exists(), 422, 'The vehicle is not available for the selected period.');
            $rentalBreakdown = $this->rentalBreakdown($data['pickup_at'], $data['return_at'], $vehicle, $data['rental_rate'] ?? null, $data['discount_percent_override'] ?? null);
            $rental = $rentalBreakdown['rental'];
            $customer = Customer::findOrFail($data['customer_id']);
            $discountCode = $this->resolveDiscountCode($data, $customer, $vehicle, $rental);
            $discountCodeAmount = $discountCode ? app(DiscountCodeService::class)->amount($discountCode, (float) $rental) : 0;
            $rental = max(0, $rental - $discountCodeAmount);
            unset($data['discount_code']);
            $addonBreakdown = $this->addonBreakdown($data['addons'] ?? [], $vehicle, $data['pickup_at'], $data['return_at']);
            $fleetSettings = FleetSetting::findOrFail(1);
            $reservationFee = (float) $fleetSettings->reservation_fee;
            $securityDeposit = (float) ($vehicle->security_deposit_fee ?? $vehicle->deposit ?? 0);
            $securityDepositType = $data['security_deposit_type'] ?? 'cash';
            $securityDeposit = $securityDepositType === 'cash' ? $securityDeposit : 0;
            $deposit = $securityDepositType === 'cash'
                ? (float) ($data['deposit'] ?? $securityDeposit)
                : 0;
            $fees = collect(['fuel_charge', 'rfid_charge', 'damage_fees', 'car_wash_fees'])->sum(fn ($fee) => (float) ($data[$fee] ?? 0));
            $extensionFees = array_key_exists('extension_fees', $data) ? (float) $data['extension_fees'] : $rentalBreakdown['extension'];
            $delivery = $this->deliveryBreakdown($data, $vehicle, $fleetSettings);
            $data['additional_charges'] = (float) ($data['additional_charges'] ?? 0) + $addonBreakdown['total'];
            $total = $this->totalBeforeDiscount($rental, $reservationFee, $securityDeposit, (float) $data['additional_charges'], $fees, $extensionFees, (float) $delivery['delivery_fee'] + (float) $delivery['return_pickup_fee'], $fleetSettings) - (float) ($data['discount'] ?? 0);
            $booking = Booking::create([...$data, ...$delivery, 'addons' => $addonBreakdown['items'], 'status' => Booking::UPCOMING, 'extension_fees' => $extensionFees, 'reference' => 'CLCH-'.now()->format('Y').'-'.str_pad((string) (Booking::max('id') + 1), 6, '0', STR_PAD_LEFT), 'rental_amount' => $rental, 'rental_discount' => $rentalBreakdown['discount'], 'discount_code_id' => $discountCode?->id, 'discount_code_amount' => $discountCodeAmount, 'total_amount' => max(0, $total), 'deposit' => $deposit, 'security_deposit_type' => $securityDepositType, 'security_deposit_asset' => $securityDepositType === 'asset' ? ($data['security_deposit_asset'] ?? null) : null, 'created_by' => $request->user()?->id]);
            if ($discountCode) {
                app(DiscountCodeService::class)->redeem($discountCode, $customer, $booking, $discountCodeAmount);
            }
            $this->syncPayments($booking, $payments);
            $booking->load(['customer', 'creator']);
            $customerName = $booking->customer?->name ?? 'A customer';
            app(PushNotificationService::class)->sendToAdmins(
                'Booking created',
                sprintf('%s created %s.', $booking->creator?->name ?? 'A staff member', $booking->reference),
                "/admin/bookings?booking={$booking->id}",
                "booking-created-{$booking->id}",
            );
            app(PartnerAssignmentSmsService::class)->send($booking);

            return response()->json($booking->load(['customer', 'vehicle.images', 'payments.fund', 'statusHistory.user']), 201);
        });
    }

    public function show(Booking $booking)
    {
        Booking::synchronizeAutomaticStatuses();
        $booking = $booking->fresh();
        abort_unless(request()->boolean('include_archived') || ! $booking->customer?->archived_at, 404);
        $booking->load([
            'customer.attachments',
            'customer.user:id,name,first_name,middle_name,last_name,date_of_birth,username,email',
            'contract',
            'vehicle.images',
            'creator',
            'payments.fund',
            'statusHistory.user',
            'returnPhotos',
        ]);
        if ($booking->contract) {
            $booking->contract->host_contract_images = collect($booking->contract->host_contract_images ?? [])
                ->map(fn (string $path): string => Storage::disk('public')->url($path))
                ->values()
                ->all();
        }
        return $booking;
    }

    public function storeReturnPhotos(Request $request, Booking $booking)
    {
        $data = $request->validate([
            'photos' => ['required', 'array', 'min:1'],
            'photos.*.file' => ['required', 'file', 'mimetypes:image/jpeg,image/png,image/webp,image/heic,video/mp4,video/quicktime,video/webm', 'max:1048576'],
            'photos.*.label' => ['nullable', 'string', 'max:120'],
        ]);
        abort_if($booking->returnPhotos()->count() + count($data['photos']) > 30, 422, 'A booking can have up to 30 return media files.');

        foreach ($data['photos'] as $photo) {
            /** @var UploadedFile $file */
            $file = $photo['file'];
            $path = $file->store('booking-returns', 'public');
            abort_unless(is_string($path) && Storage::disk('public')->exists($path), 500, 'The return media could not be saved. Check storage permissions and disk configuration.');
            $booking->returnPhotos()->create(['path' => $path, 'media_type' => str_starts_with((string) $file->getMimeType(), 'video/') ? 'video' : 'image', 'label' => filled($photo['label'] ?? null) ? trim($photo['label']) : null]);
        }

        return $booking->fresh('returnPhotos');
    }

    public function destroyReturnPhoto(Booking $booking, BookingReturnPhoto $photo)
    {
        abort_unless($photo->booking_id === $booking->id, 404);
        Storage::disk('public')->delete($photo->path);
        $photo->delete();

        return response()->noContent();
    }

    public function returnSecurityDeposit(Request $request, Booking $booking)
    {
        abort_if($booking->security_deposit_returned_at, 422, 'The security deposit has already been marked as returned.');
        abort_if($booking->status !== Booking::COMPLETE, 422, 'The security deposit can only be returned after the booking is complete.');
        abort_if(
            $booking->security_deposit_type === 'cash'
                ? (float) $booking->deposit <= 0
                : blank($booking->security_deposit_asset),
            422,
            'This booking does not have a recorded security deposit to return.'
        );

        $booking->update([
            'security_deposit_returned_at' => now(),
            'security_deposit_returned_by' => $request->user()?->id,
        ]);

        return $booking->fresh(['customer', 'vehicle.images', 'payments.fund', 'statusHistory.user', 'returnPhotos']);
    }

    public function returnAllSecurityDeposits(Request $request)
    {
        $data = $request->validate([
            'booking_ids' => ['required', 'array', 'min:1'],
            'booking_ids.*' => ['integer', 'distinct', 'exists:bookings,id'],
        ]);

        $returned = DB::transaction(function () use ($data, $request): int {
            return Booking::query()
                ->whereIn('id', $data['booking_ids'])
                ->where('status', Booking::COMPLETE)
                ->whereNull('security_deposit_returned_at')
                ->where(function ($query): void {
                    $query
                        ->where(function ($cash): void {
                            $cash->where('security_deposit_type', 'cash')
                                ->where('deposit', '>', 0);
                        })
                        ->orWhere(function ($asset): void {
                            $asset->where('security_deposit_type', 'asset')
                                ->whereNotNull('security_deposit_asset')
                                ->where('security_deposit_asset', '!=', '');
                        });
                })
                ->update([
                    'security_deposit_returned_at' => now(),
                    'security_deposit_returned_by' => $request->user()?->id,
                ]);
        });

        return response()->json(['returned' => $returned]);
    }

    public function settle(Request $request, Booking $booking)
    {
        $data = $request->validate(['fund_id' => ['required', 'exists:funds,id']]);

        return DB::transaction(function () use ($booking, $data, $request) {
            $booking = Booking::lockForUpdate()->findOrFail($booking->id);
            $amount = $this->bookingBalance($booking);
            abort_if($amount <= 0, 422, 'This booking has no outstanding balance.');
            $this->createSettlementPayment($booking, $amount, (int) $data['fund_id'], $request->user()?->id, 'Booking balance settled');

            return $booking->fresh(['customer', 'vehicle.images', 'payments.fund', 'statusHistory.user', 'returnPhotos']);
        });
    }

    public function invoice(Request $request, Booking $booking)
    {
        Booking::synchronizeAutomaticStatuses();
        $booking->load(['customer', 'vehicle', 'payments']);

        $authenticatedCustomer = $request->user()?->customer;
        abort_unless(! $authenticatedCustomer || $booking->customer_id === $authenticatedCustomer->id, 403);

        $escape = static fn (?string $value): string => e($value ?? '—');
        $peso = "\xE2\x82\xB1";
        $money = static fn (float $value): string => $peso.number_format($value, 2);
        $paid = (float) $booking->payments->sum(fn ($payment) => (float) $payment->amount);
        $balance = max(0, (float) $booking->total_amount - $paid);
        $vehicleName = $booking->vehicle
            ? trim(($booking->vehicle->name ? $booking->vehicle->name.' - ' : '').$booking->vehicle->brand.' '.$booking->vehicle->model)
            : '—';
        $rentalDays = max(1, intdiv($booking->pickup_at->diffInMinutes($booking->return_at), 24 * 60));
        $dailyRate = (float) ($booking->rental_rate ?? $booking->vehicle?->daily_rate ?? 0);
        $rentalDiscount = (float) $booking->rental_discount;
        $effectiveDailyRate = $dailyRate - ($rentalDiscount / $rentalDays);
        $deliveryRate = (float) ($booking->delivery_rate_per_km ?? 0);
        $deliveryDistance = (float) ($booking->delivery_distance_km ?? 0);
        $returnDistance = (float) ($booking->return_distance_km ?? 0);
        $lineItems = [
            ['Rental fees ('.$money($dailyRate).' regular rate; '.$money($effectiveDailyRate).' effective rate × '.$rentalDays.' '.($rentalDays === 1 ? 'day' : 'days').')', (float) $booking->rental_amount],
            ['Rental milestone discount', -$rentalDiscount],
            ...collect($booking->addons ?? [])->map(fn (array $addon) => [$addon['name'].((int) ($addon['quantity'] ?? 1) > 1 ? ' × '.(int) $addon['quantity'] : '').' ('.$addon['billing_label'].')', (float) $addon['total']])->all(),
            ['Additional charges', max(0, (float) $booking->additional_charges - collect($booking->addons ?? [])->sum(fn (array $addon) => (float) $addon['total']))],
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
        $booking->refresh();
        $data = $request->validate($this->rules(true));
        $oldStatus = $booking->status;
        $scheduleFieldsProvided = array_key_exists('pickup_at', $data) || array_key_exists('return_at', $data);
        if (
            $scheduleFieldsProvided
            && array_key_exists('status', $data)
            && $this->isEarlierBookingStatus($data['status'], $booking->status)
        ) {
            unset($data['status']);
        }
        $reason = $data['status_reason'] ?? null;
        if (array_key_exists('status', $data) && $data['status'] !== $oldStatus) {
            abort_unless(in_array($data['status'], $this->allowedStatusTransitions()[$booking->status] ?? [], true), 422, "A {$booking->status} booking cannot be changed to {$data['status']}.");
            if (in_array($data['status'], [Booking::CANCELLED, Booking::REJECTED], true)) {
                abort_if(blank($reason), 422, 'A reason is required when cancelling or rejecting a booking.');
            }
        }
        unset($data['status_reason']);
        $payments = $data['payments'] ?? null;
        $assignmentProvided = array_key_exists('assigned_to_user_id', $data);
        $assignedToUserId = $assignmentProvided
            ? ($data['assigned_to_user_id'] !== null ? (int) $data['assigned_to_user_id'] : null)
            : $booking->assigned_to_user_id;
        unset($data['assigned_to_user_id']);
        $settlementFundId = $data['settlement_fund_id'] ?? null;
        unset($data['payments']);
        unset($data['settlement_fund_id']);
        $vehicle = Vehicle::findOrFail($data['vehicle_id'] ?? $booking->vehicle_id);
        abort_unless($vehicle->hasActivePartnerContract(), 422, 'This partner vehicle is not eligible for rental until its contract is approved.');
        $vehicleChanged = array_key_exists('vehicle_id', $data) && (int) $data['vehicle_id'] !== (int) $booking->vehicle_id;
        $assignmentChanged = $assignmentProvided && $assignedToUserId !== $booking->assigned_to_user_id;
        if ($assignmentChanged && $assignedToUserId !== null) {
            $assignedStaff = User::findOrFail($assignedToUserId);
            abort_unless($assignedStaff->role === 'staff' && $assignedStaff->status === 'active', 422, 'Bookings can only be assigned to active staff accounts.');
            abort_unless($request->user()->canManageAccounts(), 403, 'Only ITM and above can assign bookings.');
        } elseif ($assignmentChanged) {
            abort_unless($request->user()->canManageAccounts(), 403, 'Only ITM and above can remove booking assignments.');
        }
        $fleetSettings = FleetSetting::findOrFail(1);
        $effectiveStatus = $data['status'] ?? $booking->status;
        if (
            in_array($effectiveStatus, Booking::ACTIVE_STATUSES, true)
            && (array_key_exists('pickup_at', $data) || array_key_exists('return_at', $data) || array_key_exists('vehicle_id', $data))
            && ! array_key_exists('addons', $data)
        ) {
            $this->validateRentalAddons($booking->addons ?? [], $vehicle, $data['pickup_at'] ?? $booking->pickup_at, $data['return_at'] ?? $booking->return_at, $booking->id);
        }
        if (array_key_exists('addons', $data)) {
            $previousAddonTotal = collect($booking->addons ?? [])->sum(fn (array $addon) => (float) ($addon['total'] ?? 0));
            foreach ($booking->addons ?? [] as $previousAddon) {
                if (($previousAddon['quantity'] ?? 0) > 0 && ($addon = Addon::lockForUpdate()->find($previousAddon['id'] ?? null)) && $addon->stock !== null) {
                    $addon->stock += (int) $previousAddon['quantity'];
                    if ($addon->status === 'out_of_stock' && $addon->stock > 0) $addon->status = 'available';
                    $addon->save();
                }
            }
            $addonBreakdown = $this->addonBreakdown($data['addons'] ?? [], $vehicle, $data['pickup_at'] ?? $booking->pickup_at, $data['return_at'] ?? $booking->return_at, $booking->id);
            $baseAdditionalCharges = max(0, (float) $booking->additional_charges - $previousAddonTotal);
            $data['addons'] = $addonBreakdown['items'];
            $data['additional_charges'] = $baseAdditionalCharges + $addonBreakdown['total'];
        }
        if (array_key_exists('delivery_address', $data) || array_key_exists('delivery_latitude', $data) || array_key_exists('delivery_longitude', $data) || array_key_exists('return_address', $data) || array_key_exists('return_latitude', $data) || array_key_exists('return_longitude', $data) || array_key_exists('payment_method', $data) || array_key_exists('vehicle_id', $data) || array_key_exists('delivery_rate_override', $data) || array_key_exists('custom_delivery_fee', $data)) {
            $data = [...$data, ...$this->deliveryBreakdown([...$booking->toArray(), ...$data], $vehicle, $fleetSettings)];
        }
        $booking->update([...$data, 'assigned_to_user_id' => $assignedToUserId]);
        $scheduleChanged = $booking->wasChanged(['pickup_at', 'return_at']);
        $reopenedForExtension = $scheduleChanged
            && $oldStatus === Booking::FOR_COMPLETION
            && (! array_key_exists('status', $data) || $data['status'] === $oldStatus)
            && $booking->pickup_at->lessThanOrEqualTo(now())
            && $booking->return_at->isFuture();
        if ($reopenedForExtension) {
            $booking->update(['status' => Booking::ONGOING]);
        }
        if (array_key_exists('status', $data) && $data['status'] !== $oldStatus) {
            $booking->statusHistory()->create(['from_status' => $oldStatus, 'to_status' => $booking->status, 'reason' => $reason, 'changed_by' => $request->user()?->id]);
        } elseif ($reopenedForExtension) {
            $booking->statusHistory()->create([
                'from_status' => $oldStatus,
                'to_status' => Booking::ONGOING,
                'reason' => 'Automatically reopened because the booking schedule was extended.',
                'changed_by' => $request->user()?->id,
            ]);
        } elseif ($reason !== null && trim($reason) !== '') {
            $booking->statusHistory()->create(['from_status' => $oldStatus, 'to_status' => $oldStatus, 'reason' => trim($reason), 'changed_by' => $request->user()?->id]);
        }
        $booking->refresh();
        $rentalBreakdown = $this->rentalBreakdown($booking->pickup_at, $booking->actual_return_at ?? $booking->return_at, $vehicle, $booking->rental_rate, $booking->discount_percent_override);
        $booking->rental_amount = $rentalBreakdown['rental'];
        $booking->rental_discount = $rentalBreakdown['discount'];
        if (! array_key_exists('extension_fees', $data)) {
            $booking->extension_fees = $rentalBreakdown['extension'];
        }
        $booking->deposit = ($booking->security_deposit_type ?? 'cash') === 'cash'
            ? (float) ($vehicle->security_deposit_fee ?? $vehicle->deposit ?? 0)
            : 0;
        if (($booking->security_deposit_type ?? 'cash') !== 'asset') {
            $booking->security_deposit_asset = null;
        }
        $booking->save();
        $this->recalculateTotal($booking);
        if ($payments !== null) $this->syncPayments($booking, $payments);
        if ($booking->status === Booking::COMPLETE) {
            $this->settleBaseBalance($booking, $settlementFundId, $request->user()?->id);
            $this->createPartnerEarning($booking);
        }
        if ($assignmentChanged && $booking->assigned_to_user_id) {
            $booking->load(['assignedTo', 'vehicle']);
            app(StaffAssignmentSmsService::class)->send($booking, $booking->assignedTo);
        }
        if ($vehicleChanged) {
            app(PartnerAssignmentSmsService::class)->send($booking);
        }
        if ($booking->status === Booking::CANCELLED && $oldStatus !== Booking::CANCELLED) {
            app(PartnerAssignmentSmsService::class)->sendCancellation($booking, $reason);
        } elseif ($scheduleChanged) {
            app(PartnerAssignmentSmsService::class)->sendScheduleUpdate($booking);
        }
        if ($oldStatus !== $booking->status) {
            $booking->load('customer');
            app(PushNotificationService::class)->sendToAdmins(
                "Booking {$booking->status}",
                "{$booking->reference} was marked {$booking->status}.",
                "/admin/bookings?booking={$booking->id}",
                "booking-{$booking->status}-{$booking->id}",
            );
        }

        return $booking->fresh(['customer', 'vehicle.images', 'payments.fund', 'statusHistory.user', 'returnPhotos', 'assignedTo']);
    }

    public function destroy(Booking $booking)
    {
        $booking->update(['status' => 'cancelled']);
        app(PartnerAssignmentSmsService::class)->sendCancellation($booking);

        return response()->noContent();
    }

    private function resolveDiscountCode(array $data, Customer $customer, Vehicle $vehicle, float $baseRental): ?\App\Models\DiscountCode
    {
        if (empty($data['discount_code'])) {
            return null;
        }

        $durationHours = (int) ceil(Carbon::parse($data['pickup_at'])->diffInMinutes(Carbon::parse($data['return_at'])) / 60);

        return app(DiscountCodeService::class)->findEligible(
            $data['discount_code'],
            $customer,
            $vehicle,
            $baseRental,
            $durationHours,
        );
    }

    private function rules(bool $updating = false): array
    {
        $pickupRule = $updating ? ['sometimes', 'date'] : ['required', 'date'];
        $returnRule = $updating ? ['sometimes', 'date', 'after:pickup_at'] : ['required', 'date', 'after:pickup_at'];
        return ['customer_id' => [$updating ? 'sometimes' : 'required', 'exists:customers,id'], 'vehicle_id' => [$updating ? 'sometimes' : 'required', 'exists:vehicles,id'], 'discount_code' => ['nullable', 'string', 'max:80'], 'assigned_to_user_id' => ['nullable', 'exists:users,id'], 'pickup_at' => $pickupRule, 'return_at' => $returnRule, 'actual_return_at' => ['nullable', 'date', 'after:pickup_at'], 'rental_rate' => ['nullable', 'numeric', 'min:0'], 'addons' => ['nullable', 'array'], 'addons.*' => ['integer', 'exists:addons,id'], 'destination' => ['nullable', 'string', 'max:255'], 'delivery_address' => ['nullable', 'string', 'max:255'], 'delivery_latitude' => ['nullable', 'numeric', 'between:-90,90'], 'delivery_longitude' => ['nullable', 'numeric', 'between:-180,180'], 'delivery_distance_km' => ['nullable', 'numeric', 'min:0'], 'delivery_rate_per_km' => ['nullable', 'numeric', 'min:0'], 'delivery_rate_override' => ['nullable', 'numeric', 'min:0'], 'delivery_fee' => ['nullable', 'numeric', 'min:0'], 'custom_delivery_fee' => ['nullable', 'numeric', 'min:0'], 'return_address' => ['nullable', 'string', 'max:255'], 'return_latitude' => ['nullable', 'numeric', 'between:-90,90'], 'return_longitude' => ['nullable', 'numeric', 'between:-180,180'], 'return_distance_km' => ['nullable', 'numeric', 'min:0'], 'return_pickup_fee' => ['nullable', 'numeric', 'min:0'], 'payment_method' => ['nullable', 'in:cash_on_pickup,cash_on_delivery'], 'notes' => ['nullable', 'string'], 'additional_charges' => ['nullable', 'numeric', 'min:0'], 'discount' => ['nullable', 'numeric', 'min:0'], 'discount_percent_override' => ['nullable', 'numeric', 'between:0,100'], 'deposit' => ['nullable', 'numeric', 'min:0'], 'security_deposit_type' => ['sometimes', 'in:cash,asset'], 'security_deposit_asset' => ['nullable', 'string', 'max:1000', 'required_if:security_deposit_type,asset'], 'fuel_charge' => ['nullable', 'numeric', 'min:0'], 'rfid_charge' => ['nullable', 'numeric', 'min:0'], 'damage_fees' => ['nullable', 'numeric', 'min:0'], 'car_wash_fees' => ['nullable', 'numeric', 'min:0'], 'extension_fees' => ['nullable', 'numeric', 'min:0'], 'status' => ['sometimes', 'in:pending,upcoming,ongoing,for_completion,complete,rejected,cancelled'], 'status_reason' => ['nullable', 'string', 'max:1000'], 'settlement_fund_id' => ['nullable', 'exists:funds,id'], 'payment_status' => ['sometimes', 'in:unpaid,partial,paid,refunded'], 'payments' => ['nullable', 'array'], 'payments.*.amount' => ['required', 'numeric', 'min:0'], 'payments.*.fund_id' => ['nullable', 'exists:funds,id'], 'payments.*.notes' => ['nullable', 'string'], 'payments.*.paid_at' => ['required', 'date']];
    }

    private function isEarlierBookingStatus(string $requestedStatus, string $currentStatus): bool
    {
        $statusOrder = [
            Booking::PENDING => 0,
            Booking::UPCOMING => 1,
            Booking::ONGOING => 2,
            Booking::FOR_COMPLETION => 3,
            Booking::COMPLETE => 4,
        ];

        return isset($statusOrder[$requestedStatus], $statusOrder[$currentStatus])
            && $statusOrder[$requestedStatus] < $statusOrder[$currentStatus];
    }

    private function authenticatedCustomer(Request $request)
    {
        $customer = $request->user()?->customer;
        abort_unless($customer, 403, 'Your account is not linked to a customer profile.');

        return $customer;
    }

    private function addonBreakdown(array $ids, Vehicle $vehicle, Carbon|string $pickupAt, Carbon|string $returnAt, ?int $ignoreBookingId = null): array
    {
        $days = max(1, intdiv(Carbon::parse($pickupAt)->diffInMinutes(Carbon::parse($returnAt)), 24 * 60));
        $peso = "\xE2\x82\xB1";
        $items = [];
        $total = 0;
        foreach (array_count_values(array_map('intval', $ids)) as $id => $quantity) {
            $addon = Addon::lockForUpdate()->findOrFail($id);
            $available = $addon->is_rental
                ? $addon->availableRentalQuantity($pickupAt, $returnAt, $ignoreBookingId)
                : ($addon->stock ?? PHP_INT_MAX);
            abort_if($addon->status !== 'available' || $available < $quantity, 422, $this->addonUnavailableMessage($addon, $pickupAt, $returnAt));
            abort_if(! in_array($vehicle->type, $addon->vehicle_types ?? [], true), 422, "{$addon->name} is not available for this vehicle category.");
            $remaining = $days;
            $amount = 0;
            $labels = [];
            foreach ($addon->pricing_tiers as $tier) {
                if ($remaining <= 0 || $days < (int) $tier['from_day']) {
                    continue;
                }
                $tierDays = min($days, (int) ($tier['to_day'] ?? $days)) - (int) $tier['from_day'] + 1;
                $tierDays = max(0, $tierDays);
                if ($tierDays === 0) continue;
                $tierAmount = (float) $tier['price'] * ($tier['billing'] === 'per_day' ? $tierDays : 1);
                $amount += $tierAmount;
                $priceLabel = $peso.number_format((float) $tier['price'], 2);
                if ($tier['billing'] === 'per_day') {
                    $labels[] = $tier['to_day'] === null
                        ? "{$priceLabel}/day after"
                        : "{$priceLabel}/day for days {$tier['from_day']}-{$tier['to_day']}";
                } elseif ($tier['to_day'] !== null && (int) $tier['from_day'] === 1) {
                    $labels[] = "{$priceLabel} for ".((int) $tier['to_day'] === 1 ? '1 day' : "{$tier['to_day']} days");
                } else {
                    $labels[] = $tier['to_day'] === null
                        ? "{$priceLabel} one-time"
                        : "{$priceLabel} for days {$tier['from_day']}-{$tier['to_day']}";
                }
                if ($tier['to_day'] === null || $days <= (int) $tier['to_day']) break;
            }
            $amount *= $quantity;
            $items[] = ['id' => $addon->id, 'name' => $addon->name, 'quantity' => $quantity, 'total' => round($amount, 2), 'billing_label' => implode('; ', $labels), 'is_rental' => $addon->is_rental];
            $total += $amount;
            if (! $addon->is_rental && $addon->stock !== null) {
                $addon->stock -= $quantity;
                if ($addon->stock === 0) $addon->status = 'out_of_stock';
                $addon->save();
            }
        }

        return ['items' => $items, 'total' => round($total, 2)];
    }

    private function validateRentalAddons(array $items, Vehicle $vehicle, Carbon|string $pickupAt, Carbon|string $returnAt, ?int $ignoreBookingId = null): void
    {
        foreach (collect($items)->groupBy('id') as $id => $group) {
            $addon = Addon::lockForUpdate()->findOrFail($id);
            if (! $addon->is_rental) {
                continue;
            }
            $quantity = $group->sum(fn (array $item) => (int) ($item['quantity'] ?? 1));
            abort_if(
                $addon->status !== 'available'
                    || ! in_array($vehicle->type, $addon->vehicle_types ?? [], true)
                    || $addon->availableRentalQuantity($pickupAt, $returnAt, $ignoreBookingId) < $quantity,
                422,
                $this->addonUnavailableMessage($addon, $pickupAt, $returnAt)
            );
        }
    }

    private function addonUnavailableMessage(Addon $addon, Carbon|string $pickupAt, Carbon|string $returnAt): string
    {
        if ($addon->is_rental) {
            $occupiedRanges = $addon->rentalBookingConflicts($pickupAt, $returnAt)
                ->map(fn (Booking $booking) => Carbon::parse($booking->pickup_at)->format('M j, Y g:i A').' to '.Carbon::parse($booking->return_at)->format('M j, Y g:i A'))
                ->implode('; ');

            if ($occupiedRanges !== '') {
                return "{$addon->name} is occupied during {$occupiedRanges}.";
            }
        }

        return "{$addon->name} is currently unavailable.";
    }

    private function allowedStatusTransitions(): array
    {
        return [
            Booking::PENDING => [Booking::UPCOMING, Booking::CANCELLED, Booking::REJECTED],
            Booking::UPCOMING => [Booking::CANCELLED],
            Booking::ONGOING => [Booking::FOR_COMPLETION, Booking::CANCELLED],
            Booking::FOR_COMPLETION => [Booking::COMPLETE, Booking::CANCELLED],
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

    private function bookingBalance(Booking $booking): float
    {
            $booking->loadMissing('payments');

            return max(0, round((float) $booking->total_amount - (float) $booking->payments->sum('amount'), 2));
        }

        private function extraChargeTotal(Booking $booking): float
        {
            $addonTotal = collect($booking->addons ?? [])->sum(fn (array $addon) => (float) ($addon['total'] ?? 0));
            $manualAdditionalCharges = max(0, (float) $booking->additional_charges - $addonTotal);

            return round($manualAdditionalCharges
                + (float) $booking->fuel_charge
                + (float) $booking->rfid_charge
                + (float) $booking->damage_fees
                + (float) $booking->car_wash_fees
                + (float) $booking->extension_fees, 2);
        }

        private function settleBaseBalance(Booking $booking, ?int $fundId, ?int $userId): void
        {
            $amount = max(0, round($this->bookingBalance($booking) - $this->extraChargeTotal($booking), 2));
            if ($amount <= 0) {
                return;
            }

            $fundId ??= Fund::query()->orderBy('id')->value('id');
            if (! $fundId) {
                Log::warning('Completed booking could not be automatically settled because no fund exists.', [
                    'booking_id' => $booking->id,
                    'reference' => $booking->reference,
                    'amount' => $amount,
                ]);
                return;
            }
            $this->createSettlementPayment($booking, $amount, (int) $fundId, $userId, 'Base booking balance settled on completion');
        }

        private function createPartnerEarning(Booking $booking): void
        {
            app(PartnerEarningService::class)->createForCompletedBooking($booking);
        }

        private function createSettlementPayment(Booking $booking, float $amount, int $fundId, ?int $userId, string $note): void
        {
            $payment = $booking->payments()->create([
                'amount' => round($amount, 2),
                'fund_id' => $fundId,
                'notes' => $note,
                'paid_at' => now(),
                'payment_method' => null,
                'status' => 'paid',
            ]);
            FundTransaction::create([
                'fund_id' => $fundId,
                'payment_id' => $payment->id,
                'type' => 'inflow',
                'transacted_at' => $payment->paid_at,
                'amount' => $payment->amount,
                'description' => "Booking payment {$booking->reference}",
                'notes' => $note,
                'created_by' => $userId ?? $booking->created_by,
            ]);
            $booking->update(['payment_status' => $this->bookingBalance($booking) <= 0 ? 'paid' : 'partial']);
        }

    private function recalculateTotal(Booking $booking): void
    {
        $vehicle = $booking->vehicle()->firstOrFail();
        $fleetSettings = FleetSetting::findOrFail(1);
        $fees = collect(['fuel_charge', 'rfid_charge', 'damage_fees', 'car_wash_fees'])->sum(fn ($fee) => (float) $booking->{$fee});
        $reservationFee = (float) $fleetSettings->reservation_fee;
        $securityDeposit = ($booking->security_deposit_type ?? 'cash') === 'cash'
            ? (float) ($vehicle->security_deposit_fee ?? $booking->deposit ?? $vehicle->deposit ?? 0)
            : 0;
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
        $rate = array_key_exists('delivery_rate_override', $data) && $data['delivery_rate_override'] !== null
            ? (float) $data['delivery_rate_override']
            : ($vehicleRate !== null && $vehicleRate > 0
            ? $vehicleRate
            : (float) $settings->default_delivery_rate_per_km);

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

        $deliveryFee = array_key_exists('custom_delivery_fee', $data) && $data['custom_delivery_fee'] !== null
            ? (float) $data['custom_delivery_fee']
            : ($deliveryDistance === null ? 0 : round($deliveryDistance * $rate, 2));

        return ['delivery_distance_km' => $deliveryDistance, 'delivery_rate_per_km' => $rate, 'delivery_fee' => $deliveryFee, 'delivery_latitude' => $hasDelivery ? (float) $data['delivery_latitude'] : null, 'delivery_longitude' => $hasDelivery ? (float) $data['delivery_longitude'] : null, 'return_distance_km' => $returnDistance, 'return_pickup_fee' => $returnDistance === null ? 0 : round($returnDistance * 2 * $rate, 2)];
    }

    private function hasCoordinates(array $data, string $latitudeKey, string $longitudeKey): bool
    {
        return array_key_exists($latitudeKey, $data)
            && array_key_exists($longitudeKey, $data)
            && is_numeric($data[$latitudeKey])
            && is_numeric($data[$longitudeKey]);
    }

    private function rentalBreakdown(Carbon|string $pickupAt, Carbon|string $returnAt, Vehicle $vehicle, float|string|null $rentalRate = null, float|string|null $discountPercentOverride = null): array
    {
        $pickupAt = $pickupAt instanceof Carbon ? $pickupAt : Carbon::parse($pickupAt);
        $returnAt = $returnAt instanceof Carbon ? $returnAt : Carbon::parse($returnAt);
        $minutes = $pickupAt->diffInMinutes($returnAt);
        $dailyRate = $rentalRate === null ? (float) $vehicle->daily_rate : (float) $rentalRate;
        $halfDayRate = $vehicle->twelve_hour_rate !== null
            ? (float) $vehicle->twelve_hour_rate
            : $dailyRate * 0.5;
        if ($minutes <= 12 * 60) {
            $discountPercent = $discountPercentOverride === null ? 0 : (float) $discountPercentOverride;
            $discount = round($halfDayRate * ($discountPercent / 100), 2);
            return ['rental' => max(0, $halfDayRate - $discount), 'discount' => $discount, 'discount_percent' => $discountPercent, 'extension' => 0];
        }
        $days = intdiv($minutes, 24 * 60);
        $settings = FleetSetting::findOrFail(1);
        $remainingMinutes = $minutes % (24 * 60);
        $billableMinutes = max(0, $remainingMinutes - (int) $settings->late_return_grace_period_minutes);
        $remainingHours = (int) ceil($billableMinutes / 60);
        $hourlyRate = (float) ($vehicle->hour_extension_rate ?? $settings->default_hour_extension_rate);
        $rentalDays = max(1, $days);
        $discountPercent = $discountPercentOverride === null
            ? $this->discountPercent($settings, (string) $vehicle->type, $rentalDays)
            : (float) $discountPercentOverride;
        $baseRental = $rentalDays * $dailyRate;
        $discount = round($baseRental * ($discountPercent / 100), 2);
        $discountedDailyRate = $dailyRate * (1 - ($discountPercent / 100));
        $discountedHalfDayRate = $halfDayRate * (1 - ($discountPercent / 100));
        $extension = $remainingHours === 0
            ? 0
            : ($billableMinutes === 12 * 60
                ? $discountedHalfDayRate
                : ($remainingHours >= $settings->full_day_extension_threshold_hours ? $discountedDailyRate : $remainingHours * $hourlyRate));

        return ['rental' => max(0, $baseRental - $discount), 'discount' => $discount, 'discount_percent' => $discountPercent, 'extension' => $extension];
    }

    private function discountPercent(FleetSetting $settings, string $vehicleType, int $rentalDays): float
    {
        $milestones = collect($settings->discount_structures ?? [])
            ->filter(fn (array $structure): bool => in_array($vehicleType, $structure['vehicle_types'] ?? [], true))
            ->flatMap(fn (array $structure) => $structure['milestones'] ?? [])
            ->filter(fn (array $milestone): bool => (int) ($milestone['days'] ?? 0) <= $rentalDays)
            ->sortByDesc(fn (array $milestone): int => (int) $milestone['days'])
            ->first();

        return $milestones ? (float) ($milestones['discount_percent'] ?? 0) : 0;
    }
}
