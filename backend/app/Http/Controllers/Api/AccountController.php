<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AccountController extends Controller
{
    public function index(Request $request)
    {
        $accounts = User::query()
            ->whereIn('role', ['owner', 'co_owner', 'it_management', 'staff'])
            ->when($request->search, function ($query, $search) {
                $query->where(fn ($user) => $user
                    ->where('name', 'like', "%{$search}%")
                    ->orWhere('username', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%"));
            })
            ->when($request->role, fn ($query, $role) => $query->where('role', $role))
            ->when($request->status, fn ($query, $status) => $query->where('status', $status))
            ->orderBy('name')
            ->get(['id', 'name', 'username', 'email', 'role', 'status', 'last_login_at', 'created_at']);

        $customers = Customer::with('user')
            ->when($request->customer_search, function ($query, $search) {
                $query->where(fn ($customer) => $customer
                    ->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%"));
            })
            ->latest()
            ->get(['id', 'user_id', 'name', 'email', 'phone', 'created_at']);

        return [
            'data' => $request->user()->canManageAccounts() ? $accounts : [],
            'customers' => $customers,
        ];
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->rules());
        abort_unless($request->user()->canManageRole($data['role']), 403, 'You cannot assign this role.');

        $account = User::create([
            ...$data,
            'password' => Hash::make($data['password']),
        ]);

        return response()->json($account->only(['id', 'name', 'username', 'email', 'role', 'status', 'last_login_at', 'created_at']), 201);
    }

    public function update(Request $request, User $account)
    {
        abort_unless($account->role !== 'owner' || $request->user()->isOwner(), 403, 'Only the owner can update an owner account.');
        $data = $request->validate($this->rules(true, $account->id));
        $isSelf = $account->id === $request->user()->id;
        if (isset($data['role'])) {
            abort_unless(($isSelf && $data['role'] === $account->role) || $request->user()->canManageRole($account->role), 403, 'You cannot manage this account.');
            abort_unless(($isSelf && $data['role'] === $account->role) || $request->user()->canManageRole($data['role']), 403, 'You cannot assign this role.');
        } elseif (! $isSelf) {
            abort_unless($request->user()->canManageRole($account->role), 403, 'You cannot manage this account.');
        }

        if (! empty($data['password'])) {
            $data['password'] = Hash::make($data['password']);
        } else {
            unset($data['password']);
        }
        $account->update($data);

        return $account->fresh()->only(['id', 'name', 'username', 'email', 'role', 'status', 'last_login_at', 'created_at']);
    }

    public function destroy(Request $request, User $account)
    {
        abort_if($account->id === $request->user()->id, 422, 'You cannot delete your own account.');
        abort_unless($request->user()->canManageRole($account->role), 403, 'You cannot delete this account.');
        $account->delete();

        return response()->noContent();
    }

    private function rules(bool $updating = false, ?int $accountId = null): array
    {
        return [
            'name' => [$updating ? 'sometimes' : 'required', 'string', 'max:255'],
            'username' => [$updating ? 'sometimes' : 'required', 'string', 'min:3', 'max:50', 'alpha_dash', 'unique:users,username'.($updating ? ','.$accountId : '')],
            'email' => [$updating ? 'sometimes' : 'required', 'email', 'max:255', 'unique:users,email'.($updating ? ','.$accountId : '')],
            'password' => [$updating ? 'nullable' : 'required', 'string', 'min:8'],
            'role' => [$updating ? 'sometimes' : 'required', 'in:'.($updating ? 'owner,co_owner,it_management,staff' : 'co_owner,it_management,staff')],
            'status' => [$updating ? 'sometimes' : 'required', 'in:active,suspended'],
        ];
    }

}
