<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\DB;
use App\Models\Booking;
use App\Models\IpBlock;
use App\Services\CustomerPhoneVerificationService;
use App\Services\CustomerLoyaltyService;

class CustomerController extends Controller
{
    public function profile(Request $request, CustomerLoyaltyService $loyalty)
    {
        $customer = $request->user()?->customer;
        if ($customer) $loyalty->sync($customer);
        return $customer?->load('attachments')->setAttribute('loyalty', $loyalty->summary($customer))
            ?? response()->json(['message' => 'Your account is not linked to a customer profile.'], 404);
    }

    public function completeOnboarding(Request $request, CustomerPhoneVerificationService $verification)
    {
        $customer = $request->user()?->customer;
        abort_unless($customer, 404, 'Your account is not linked to a customer profile.');

        $data = $request->validate([
            'first_name' => ['required', 'string', 'min:2', 'max:100'],
            'last_name' => ['required', 'string', 'min:2', 'max:100'],
            'date_of_birth' => ['nullable', 'date', 'before:today'],
            'address' => ['required', 'string', 'min:5', 'max:1000'],
            'phone' => ['nullable', 'string', 'max:40'],
            'referral_source' => ['required', 'in:facebook,tiktok,google_search,word_of_mouth'],
        ]);

        $firstName = trim($data['first_name']);
        $lastName = trim($data['last_name']);
        abort_if($firstName === '' || $lastName === '', 422, 'First name and last name are required.');

        $phone = $data['phone'] ? $verification->normalizePhone($data['phone']) : null;
        abort_if($data['phone'] && ! $phone, 422, 'Enter a valid Philippine mobile number.');

        DB::transaction(function () use ($customer, $data, $firstName, $lastName, $phone) {
            $phoneChanged = ($customer->phone ?? null) !== $phone;
            $name = trim($firstName.' '.$lastName);
            $customer->update([
                'name' => $name,
                'first_name' => $firstName,
                'last_name' => $lastName,
                'date_of_birth' => $data['date_of_birth'] ?? null,
                'address' => trim($data['address']),
                'phone' => $phone,
                'phone_verified_at' => $phoneChanged ? null : $customer->phone_verified_at,
                'referral_source' => $data['referral_source'],
                'onboarding_completed_at' => now(),
            ]);
            $customer->user()->update([
                'name' => $name,
                'first_name' => $firstName,
                'last_name' => $lastName,
                'date_of_birth' => $data['date_of_birth'] ?? null,
                'phone' => $phone,
            ]);
        });

        return $request->user()->fresh()->load('customer.attachments');
    }

    public function sendPhoneVerification(Request $request, CustomerPhoneVerificationService $verification)
    {
        $customer = $request->user()?->customer;
        abort_unless($customer, 404, 'Your account is not linked to a customer profile.');
        $data = $request->validate(['phone' => ['required', 'string', 'max:40']]);
        $phone = $verification->normalizePhone($data['phone']);
        abort_unless($phone, 422, 'Enter a valid Philippine mobile number.');

        if ($customer->phone_verification_sent_at?->gt(now()->subSeconds(60))) {
            abort(429, 'Please wait before requesting another verification code.');
        }

        try {
            $verification->sendCode($customer, $phone);
        } catch (\Illuminate\Http\Client\HttpClientException|\RuntimeException $exception) {
            report($exception);
            abort(502, 'Unable to send the verification code. Please try again.');
        }

        return ['phone' => $phone, 'message' => 'Verification code sent.'];
    }

    public function verifyPhone(Request $request, CustomerPhoneVerificationService $verification)
    {
        $customer = $request->user()?->customer;
        abort_unless($customer, 404, 'Your account is not linked to a customer profile.');
        $data = $request->validate(['code' => ['required', 'digits:6']]);

        try {
            $verification->verifyCode($customer, $data['code']);
        } catch (\RuntimeException $exception) {
            abort(422, $exception->getMessage());
        }

        return ['phone_verified_at' => $customer->fresh()->phone_verified_at, 'message' => 'Phone number verified.'];
    }

    public function uploadOnboardingAttachments(Request $request)
    {
        $customer = $request->user()?->customer;
        abort_unless($customer, 404, 'Your account is not linked to a customer profile.');
        $data = $request->validate([
            'attachments' => ['required', 'array', 'min:1'],
            'attachments.*.category' => ['required', 'in:license,ltms,secondary_id,selfie_license'],
            'attachments.*.file' => ['required', 'image', 'max:20480'],
        ]);

        DB::transaction(fn () => $this->storeAttachments($customer, $data['attachments']));

        return $customer->fresh('attachments');
    }

    public function index(Request $request)
    {
        $customers = Customer::with(['user:id,last_login_ip', 'attachments', 'bookings' => fn ($query) => $query
            ->whereNotIn('status', ['cancelled', 'rejected'])
            ->with('payments')])
            ->withCount(['bookings' => fn ($query) => $query->whereNotIn('status', ['cancelled', 'rejected'])])
            ->when(! $request->boolean('include_archived'), fn ($query) => $query->whereNull('archived_at'))
            ->when($request->search, fn ($q, $s) => $q->where(fn ($q) => $q->where('name', 'like', "%$s%")->orWhere('email', 'like', "%$s%")->orWhere('phone', 'like', "%$s%")))
            ->latest()
            ->paginate(min(100, max(1, (int) $request->input('per_page', 15))));

        $customers->getCollection()->transform(function (Customer $customer) {
            $customer->setAttribute('outstanding_balance', $customer->bookings->sum(fn ($booking) => $booking->balance));
            $customer->setAttribute('ip_block_scopes', IpBlock::where('ip_address', $customer->user?->last_login_ip)->pluck('scope')->values());
            $customer->unsetRelation('bookings');

            return $customer;
        });

        return $customers;
    }

    public function summary()
    {
        $customers = Customer::query()
            ->whereNull('archived_at')
            ->withCount(['bookings' => fn ($query) => $query->whereNotIn('status', ['cancelled', 'rejected'])])
            ->get(['id', 'name']);
        $balances = Customer::whereNull('archived_at')->with(['bookings' => fn ($query) => $query
            ->whereNotIn('status', ['cancelled', 'rejected'])
            ->with('payments')])
            ->get();

        $topCustomer = $customers->sortByDesc('bookings_count')->first();
        $totalReceivable = $balances->sum(fn (Customer $customer) => $customer->bookings->sum(fn ($booking) => $booking->balance));

        return [
            'total_customers' => Customer::whereNull('archived_at')->count(),
            'top_customer' => $topCustomer ? [
                'id' => $topCustomer->id,
                'name' => $topCustomer->name,
                'bookings_count' => $topCustomer->bookings_count,
            ] : null,
            'total_receivable' => (float) $totalReceivable,
        ];
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->rules());
        $data['name'] = $this->compositeName($data);
        $attachments = $data['attachments'] ?? [];
        unset($data['attachments']);
        $customer = Customer::create($data);
        $this->syncLinkedUser($customer);
        $this->storeAttachments($customer, $attachments);

        return response()->json($customer->load('attachments'), 201);
    }

    public function show(Customer $customer, CustomerLoyaltyService $loyalty)
    {
        $customer->load([
            'user:id,last_login_ip',
            'bookings' => fn ($query) => $query->when(! request()->boolean('include_archived') && $customer->archived_at, fn ($query) => $query->whereRaw('1 = 0'))->latest('pickup_at'),
            'bookings.vehicle',
            'bookings.payments',
            'attachments',
        ])->setAttribute('ip_block_scopes', IpBlock::where('ip_address', $customer->user?->last_login_ip)->pluck('scope')->values());

        return $customer->setAttribute('loyalty', $loyalty->summary($customer));
    }

    public function update(Request $request, Customer $customer)
    {
        $data = $request->validate($this->rules());
        $data['name'] = $this->compositeName($data, $customer);
        foreach (['first_name', 'middle_name', 'last_name'] as $part) {
            if (! array_key_exists($part, $data)) {
                $data[$part] = $customer->{$part};
            }
        }
        $attachments = $data['attachments'] ?? [];
        unset($data['attachments']);
        $customer->update($data);
        $this->syncLinkedUser($customer->fresh());
        $this->storeAttachments($customer, $attachments);

        return $customer->fresh('attachments');
    }

    public function destroy(Customer $customer)
    {
        $customer->update(['archived_at' => now()]);

        return response()->noContent();
    }

    public function restore(Customer $customer)
    {
        $customer->update(['archived_at' => null]);

        return response()->json($customer->fresh());
    }

    public function blockIp(Request $request, Customer $customer)
    {
        $data = $request->validate([
            'scope' => ['required', 'in:all,bookings'],
            'reason' => ['nullable', 'string', 'max:255'],
            'delete_bookings' => ['sometimes', 'boolean'],
        ]);
        $ip = $customer->user?->last_login_ip;
        abort_unless($ip, 422, 'This customer has no recorded login IP address.');

        IpBlock::updateOrCreate(
            ['ip_address' => $ip, 'scope' => $data['scope']],
            ['reason' => $data['reason'] ?? null, 'blocked_by' => $request->user()->id],
        );

        if ($request->boolean('delete_bookings')) {
            $this->deleteRemovableBookings($customer);
        }

        return response()->json(['message' => 'The customer IP address has been blocked.', 'ip_address' => $ip]);
    }

    public function unblockIp(Customer $customer)
    {
        $ip = $customer->user?->last_login_ip;
        abort_unless($ip, 422, 'This customer has no recorded login IP address.');
        IpBlock::where('ip_address', $ip)->delete();

        return response()->noContent();
    }

    public function purgeBookings(Customer $customer)
    {
        $deleted = $this->deleteRemovableBookings($customer);

        return response()->json(['deleted' => $deleted]);
    }

    private function deleteRemovableBookings(Customer $customer): int
    {
        return DB::transaction(function () use ($customer) {
            return $customer->bookings()->whereIn('status', [Booking::PENDING, Booking::REJECTED, Booking::CANCELLED])->delete();
        });
    }

    public function destroyAttachment(Customer $customer, \App\Models\CustomerAttachment $attachment)
    {
        abort_unless($attachment->customer_id === $customer->id, 404);
        \Illuminate\Support\Facades\Storage::disk('public')->delete($attachment->path);
        $attachment->delete();

        return response()->noContent();
    }

    private function rules(): array
    {
        return ['name' => ['nullable', 'string', 'max:150'], 'first_name' => ['nullable', 'string', 'max:100'], 'middle_name' => ['nullable', 'string', 'max:100'], 'last_name' => ['nullable', 'string', 'max:100'], 'email' => ['nullable', 'email'], 'phone' => ['nullable', 'string', 'max:40'], 'address' => ['nullable', 'string'], 'date_of_birth' => ['nullable', 'date'], 'license_number' => ['nullable', 'string'], 'license_expiry' => ['nullable', 'date'], 'identification_information' => ['nullable', 'string'], 'notes' => ['nullable', 'string'], 'referral_source' => ['nullable', 'in:facebook,tiktok,google_search,word_of_mouth'], 'attachments' => ['nullable', 'array'], 'attachments.*.category' => ['required', 'in:license,ltms,proof_of_billing,secondary_id,selfie_license'], 'attachments.*.file' => ['required', 'image', 'max:20480']];
    }

    private function compositeName(array $data, ?Customer $customer = null): string
    {
        $parts = array_filter([$data['first_name'] ?? null, $data['middle_name'] ?? null, $data['last_name'] ?? null], fn ($part) => filled(trim((string) $part)));

        return $parts ? implode(' ', $parts) : ($data['name'] ?? $customer?->name ?? '');
    }

    private function syncLinkedUser(Customer $customer): void
    {
        if (! $customer->user) {
            return;
        }

        $parts = array_filter([$customer->first_name, $customer->middle_name, $customer->last_name], fn ($part) => filled(trim((string) $part)));
        $customer->user->update([
            'first_name' => $customer->first_name,
            'middle_name' => $customer->middle_name,
            'last_name' => $customer->last_name,
            'name' => $parts ? implode(' ', $parts) : $customer->name,
            'date_of_birth' => $customer->date_of_birth,
        ]);
    }

    private function storeAttachments(Customer $customer, array $attachments): void
    {
        $limits = ['license' => 2, 'ltms' => 4, 'proof_of_billing' => 5, 'secondary_id' => 2, 'selfie_license' => 1];
        foreach ($attachments as $attachment) {
            $category = $attachment['category'];
            abort_if($customer->attachments()->where('category', $category)->count() >= $limits[$category], 422, "The {$category} attachment limit has been reached.");
            /** @var UploadedFile $file */
            $file = $attachment['file'];
            $path = $file->store('customers', 'public');
            abort_unless(is_string($path) && Storage::disk('public')->exists($path), 500, 'The customer attachment could not be saved. Check storage permissions and disk configuration.');
            $customer->attachments()->create(['category' => $category, 'path' => $path]);
        }
    }
}
