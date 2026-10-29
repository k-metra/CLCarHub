<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Partner;
use App\Models\Fund;
use App\Models\FundTransaction;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use App\Models\User;
use App\Models\HostActivationToken;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use App\Notifications\HostInvitationNotification;
use App\Models\PartnerEarning;
use App\Services\PartnerAssignmentSmsService;
use App\Services\PartnerPayoutSmsService;
use App\Models\PartnerPayoutMethod;

class PartnerController extends Controller
{
    public function index()
    {
        return Partner::with(['user:id,name,email,role,status,email_verified_at,last_login_at'])->withCount('vehicles')->latest()->paginate(50);
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->rules());
        $data['contact_number'] = app(PartnerAssignmentSmsService::class)->normalizePhone($data['contact_number']) ?? $data['contact_number'];
        $data['name'] = $this->compositeName($data);

        $partner = Partner::create($data);
        \App\Models\Customer::create([
            'name' => $partner->name,
            'first_name' => $partner->first_name,
            'middle_name' => $partner->middle_name,
            'last_name' => $partner->last_name,
            'email' => $partner->email,
            'phone' => $partner->contact_number,
            'address' => $partner->address,
        ]);

        return response()->json($partner, 201);
    }

    public function show(Partner $partner)
    {
        return $partner->load([
            'user:id,name,email,role,status,email_verified_at,last_login_at',
            'vehicles.images',
            'vehicles.partnerContracts',
            'vehicles.bookings.customer',
            'vehicles.bookings.payments',
            'vehicleContracts.vehicle',
            'contractDocuments',
            'earnings.vehicle.images',
            'earnings.booking.customer',
            'payouts.fund',
            'payouts.payoutMethod',
            'payoutMethods',
        ]);
    }

    public function storePayoutMethod(Request $request, Partner $partner)
    {
        $data = $request->validate([
            'type' => ['required', Rule::in(['bank', 'e_wallet'])],
            'provider_name' => ['required', 'string', 'max:100'],
            'account_name' => ['required', 'string', 'max:255'],
            'account_number' => ['required', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'is_primary' => ['sometimes', 'boolean'],
        ]);
        if ($data['is_primary'] ?? false) {
            $partner->payoutMethods()->update(['is_primary' => false]);
        }

        return response()->json($partner->payoutMethods()->create($data), 201);
    }

    public function updatePayoutMethod(Request $request, PartnerPayoutMethod $partnerPayoutMethod)
    {
        $data = $request->validate([
            'type' => ['sometimes', Rule::in(['bank', 'e_wallet'])],
            'provider_name' => ['sometimes', 'string', 'max:100'],
            'account_name' => ['sometimes', 'string', 'max:255'],
            'account_number' => ['sometimes', 'string', 'max:100'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'is_primary' => ['sometimes', 'boolean'],
        ]);
        if ($data['is_primary'] ?? false) {
            $partnerPayoutMethod->partner->payoutMethods()->where('id', '!=', $partnerPayoutMethod->id)->update(['is_primary' => false]);
        }
        $partnerPayoutMethod->update($data);

        return $partnerPayoutMethod->fresh();
    }

    public function destroyPayoutMethod(PartnerPayoutMethod $partnerPayoutMethod)
    {
        $partnerPayoutMethod->delete();

        return response()->noContent();
    }

    public function provision(Request $request, Partner $partner)
    {
        abort_if($partner->user_id, 422, 'This partner already has a linked user account.');
        $data = $request->validate([
            'user_id' => ['nullable', 'exists:users,id'],
            'email' => ['required_without:user_id', 'email', 'max:255'],
            'name' => ['required_without:user_id', 'string', 'max:255'],
        ]);

        [$user, $activationToken] = DB::transaction(function () use ($data, $partner) {
            $user = isset($data['user_id'])
                ? User::findOrFail($data['user_id'])
                : User::where('email', $data['email'])->first();

            if (! $user) {
                $user = User::create([
                    'name' => $data['name'],
                    'email' => $data['email'],
                    'password' => Hash::make(Str::random(48)),
                    'role' => 'host',
                    'status' => 'active',
                ]);
            } else {
                abort_if($user->partner()->exists(), 422, 'This user is already linked to a partner.');
                $user->update(['role' => 'host', 'status' => 'active']);
            }

            $token = Str::random(64);
            HostActivationToken::where('user_id', $user->id)->whereNull('used_at')->update(['used_at' => now()]);
            HostActivationToken::create([
                'user_id' => $user->id,
                'token_hash' => hash('sha256', $token),
                'expires_at' => now()->addDays(7),
            ]);
            $partner->update([
                'user_id' => $user->id,
                'host_access_status' => 'pending_activation',
                'host_access_granted_at' => null,
                'host_access_revoked_at' => null,
            ]);
            $customer = \App\Models\Customer::whereNull('user_id')->where('email', $partner->email)->first();
            if ($customer) {
                $customer->update(['user_id' => $user->id]);
            } else {
                $user->customer()->create([
                    'name' => $partner->name,
                    'first_name' => $partner->first_name,
                    'middle_name' => $partner->middle_name,
                    'last_name' => $partner->last_name,
                    'email' => $partner->email,
                    'phone' => $partner->contact_number,
                    'address' => $partner->address,
                ]);
            }

            return [$user, $token];
        });

        return [
            'partner' => $partner->fresh()->load('user:id,name,email,role,status,email_verified_at'),
            'activation_token' => $activationToken,
            'activation_expires_at' => now()->addDays(7),
            'activation_url' => $this->activationUrl($activationToken),
        ];
    }

    public function accountCandidates(Request $request)
    {
        return User::query()
            ->whereIn('role', ['owner', 'co_owner', 'it_management', 'staff', 'host'])
            ->whereDoesntHave('partner')
            ->when($request->search, fn ($query, $search) => $query->where(fn ($users) => $users
                ->where('name', 'like', "%{$search}%")
                ->orWhere('email', 'like', "%{$search}%")
                ->orWhere('username', 'like', "%{$search}%")))
            ->orderBy('name')
            ->limit(20)
            ->get(['id', 'name', 'email', 'username', 'role', 'status']);
    }

    public function sendInvitation(Partner $partner)
    {
        abort_unless($partner->user && $partner->host_access_status === 'pending_activation', 422, 'This partner is not awaiting an invitation.');

        $token = Str::random(64);
        HostActivationToken::where('user_id', $partner->user->id)->whereNull('used_at')->update(['used_at' => now()]);
        HostActivationToken::create([
            'user_id' => $partner->user->id,
            'token_hash' => hash('sha256', $token),
            'expires_at' => now()->addDays(7),
        ]);
        $partner->user->notify(new HostInvitationNotification($this->activationUrl($token)));

        return ['message' => 'The host invitation email has been sent.'];
    }

    private function activationUrl(string $token): string
    {
        return rtrim((string) config('app.frontend_url'), '/') . '/host/activate?token=' . urlencode($token);
    }

    public function revoke(Partner $partner)
    {
        if ($partner->host_access_status === 'pending_activation') {
            DB::transaction(function () use ($partner): void {
                if ($partner->user_id) {
                    HostActivationToken::where('user_id', $partner->user_id)
                        ->whereNull('used_at')
                        ->update(['used_at' => now()]);
                }

                $partner->update([
                    'user_id' => null,
                    'host_access_status' => 'not_provisioned',
                    'host_access_granted_at' => null,
                    'host_access_revoked_at' => null,
                ]);
            });

            return $partner->fresh()->load('user:id,name,email,role,status,email_verified_at');
        }

        $partner->update(['host_access_status' => 'revoked', 'host_access_revoked_at' => now()]);
        if ($partner->user) {
            $partner->user->update(['status' => 'suspended']);
            $partner->user->tokens()->delete();
        }

        return $partner->fresh()->load('user:id,name,email,role,status,email_verified_at');
    }

    public function reactivate(Partner $partner)
    {
        abort_unless($partner->user, 422, 'This partner does not have a linked user account.');
        abort_unless($partner->host_access_status === 'revoked', 422, 'Only revoked host access can be reactivated.');

        $partner->user->update([
            'role' => 'host',
            'status' => 'active',
        ]);
        $partner->update([
            'host_access_status' => 'active',
            'host_access_granted_at' => now(),
            'host_access_revoked_at' => null,
        ]);

        return $partner->fresh()->load('user:id,name,email,role,status,email_verified_at');
    }

    public function earnings(Request $request, Partner $partner)
    {
        return $partner->earnings()->with(['vehicle', 'booking'])->latest('earned_at')->paginate(50);
    }

    public function updateEarning(Request $request, PartnerEarning $partnerEarning)
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(['pending', 'approved', 'paid', 'cancelled'])],
            'notes' => ['nullable', 'string'],
        ]);
        $partnerEarning->update($data);

        return $partnerEarning->fresh(['vehicle', 'booking']);
    }

    public function storeEarning(Request $request, Partner $partner)
    {
        $data = $request->validate([
            'vehicle_id' => ['required', 'exists:vehicles,id'],
            'booking_id' => ['nullable', 'exists:bookings,id'],
            'gross_amount' => ['required', 'numeric', 'min:0'],
            'commission_amount' => ['required', 'numeric', 'min:0'],
            'earned_at' => ['required', 'date'],
            'status' => ['required', Rule::in(['pending', 'approved', 'paid', 'cancelled'])],
            'notes' => ['nullable', 'string'],
        ]);
        $vehicle = $partner->vehicles()->findOrFail($data['vehicle_id']);
        $earning = $partner->earnings()->create([
            ...$data,
            'net_amount' => max(0, (float) $data['gross_amount'] - (float) $data['commission_amount']),
        ]);

        return response()->json($earning->load('vehicle', 'booking'), 201);
    }

    public function payouts(Request $request, Partner $partner)
    {
        return $partner->payouts()->with(['processor', 'fund'])->latest()->paginate(50);
    }

    public function storePayout(Request $request, Partner $partner)
    {
        $data = $request->validate([
            'amount' => ['required', 'numeric', 'min:0.01'],
            'status' => ['required', Rule::in(['pending', 'paid', 'cancelled'])],
            'fund_id' => ['required', 'exists:funds,id'],
            'partner_payout_method_id' => ['required', 'exists:partner_payout_methods,id'],
            'paid_at' => ['nullable', 'date'],
            'payment_reference' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],
        ]);
        $eligibleNet = (float) $partner->earnings()
            ->whereIn('status', ['approved'])
            ->sum('net_amount');
        $paidOrPending = (float) $partner->payouts()
            ->whereIn('status', ['pending', 'paid'])
            ->sum('amount');
        $remaining = round($eligibleNet - $paidOrPending, 2);
        abort_if((float) $data['amount'] > $remaining, 422, "Payout amount exceeds the partner's eligible outstanding balance.");
        abort_unless($partner->payoutMethods()->whereKey($data['partner_payout_method_id'])->exists(), 422, 'The selected payout method does not belong to this partner.');
        $payout = DB::transaction(function () use ($partner, $data, $request) {
            $payout = $partner->payouts()->create([...$data, 'processed_by' => $request->user()->id]);
            if ($payout->status === 'paid') {
                $this->recordPayoutFundTransaction($payout, $request);
            }

            return $payout;
        });
        if ($payout->status === 'paid') {
            app(PartnerPayoutSmsService::class)->send($payout);
        }

        return response()->json($payout->fresh(['fund', 'payoutMethod']), 201);
    }

    public function updatePayout(Request $request, \App\Models\PartnerPayout $partnerPayout)
    {
        $data = $request->validate([
            'status' => ['sometimes', Rule::in(['pending', 'paid', 'cancelled'])],
            'fund_id' => ['sometimes', 'required', 'exists:funds,id'],
            'partner_payout_method_id' => ['sometimes', 'required', 'exists:partner_payout_methods,id'],
            'paid_at' => ['nullable', 'date'],
            'payment_reference' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],
        ]);
        abort_if($partnerPayout->status === 'paid' && ($data['status'] ?? 'paid') !== 'paid', 422, 'A paid payout cannot be cancelled or reopened.');
        if (isset($data['partner_payout_method_id'])) {
            abort_unless($partnerPayout->partner->payoutMethods()->whereKey($data['partner_payout_method_id'])->exists(), 422, 'The selected payout method does not belong to this partner.');
        }
        if (($data['status'] ?? $partnerPayout->status) === 'paid') {
            abort_unless($partnerPayout->fund_id || isset($data['fund_id']), 422, 'A fund is required before marking the payout as paid.');
            abort_unless($partnerPayout->partner_payout_method_id || isset($data['partner_payout_method_id']), 422, 'A payout destination is required before marking the payout as paid.');
            $partnerPayout->update($data);
            $this->recordPayoutFundTransaction($partnerPayout->fresh(), $request);
            app(PartnerPayoutSmsService::class)->send($partnerPayout->fresh());
        } else {
            $partnerPayout->update($data);
        }

        return $partnerPayout->fresh(['fund', 'payoutMethod']);
    }

    private function recordPayoutFundTransaction(\App\Models\PartnerPayout $payout, Request $request): void
    {
        DB::transaction(function () use ($payout, $request): void {
            $payout->refresh();
            abort_unless($payout->fund_id, 422, 'A fund is required for this payout.');
            if (FundTransaction::where('partner_payout_id', $payout->id)->exists()) {
                return;
            }

            $fund = Fund::query()->lockForUpdate()->findOrFail($payout->fund_id);
            $balance = (float) $fund->opening_balance
                + (float) $fund->transactions()->where('type', 'inflow')->sum('amount')
                - (float) $fund->transactions()->where('type', 'outflow')->sum('amount');
            abort_if((float) $payout->amount > $balance, 422, "The selected fund does not have enough available balance.");

            FundTransaction::create([
                'fund_id' => $fund->id,
                'partner_payout_id' => $payout->id,
                'type' => 'outflow',
                'transacted_at' => $payout->paid_at ?? now(),
                'amount' => $payout->amount,
                'description' => "Partner payout to {$payout->partner->name}",
                'notes' => trim(collect([
                    $payout->payment_reference ? "Payment reference: {$payout->payment_reference}" : null,
                    $payout->notes,
                ])->filter()->implode("\n")),
                'created_by' => $request->user()?->id,
            ]);
        });
    }

    public function update(Request $request, Partner $partner)
    {
        $data = $request->validate($this->rules());
        $data['contact_number'] = app(PartnerAssignmentSmsService::class)->normalizePhone($data['contact_number']) ?? $data['contact_number'];
        $data['name'] = $this->compositeName($data);
        $partner->update($data);

        return $partner->fresh()->loadCount('vehicles');
    }

    public function destroy(Partner $partner)
    {
        $partner->vehicles()->update(['partner_id' => null, 'ownership' => 'CL CarHub']);
        $partner->delete();

        return response()->noContent();
    }

    private function rules(): array
    {
        return [
            'first_name' => ['required', 'string', 'max:100'],
            'middle_name' => ['nullable', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'email', 'max:255'],
            'contact_number' => ['required', 'string', 'max:40'],
            'vehicles_stored_at_garage' => ['sometimes', 'boolean'],
            'address' => ['required', 'string'],
            'commission_based_on' => ['required', Rule::in(['base_rent_only', 'total_booking_amount'])],
            'commission_type' => ['required', Rule::in(['percentage', 'fixed_amount'])],
            'commission_value' => ['required', 'numeric', 'min:0'],
        ];
    }

    private function compositeName(array $data): string
    {
        $middleName = trim((string) ($data['middle_name'] ?? ''));

        return $data['last_name'].', '.$data['first_name'].($middleName ? ' '.$middleName : '');
    }
}
