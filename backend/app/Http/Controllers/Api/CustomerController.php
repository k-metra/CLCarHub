<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use Illuminate\Http\Request;

class CustomerController extends Controller
{
    public function index(Request $request)
    {
        return Customer::withCount('bookings')->when($request->search, fn ($q, $s) => $q->where(fn ($q) => $q->where('name', 'like', "%$s%")->orWhere('email', 'like', "%$s%")->orWhere('phone', 'like', "%$s%")))->latest()->paginate(15);
    }

    public function store(Request $request)
    {
        return response()->json(Customer::create($request->validate($this->rules())), 201);
    }

    public function show(Customer $customer)
    {
        return $customer->load('bookings.vehicle');
    }

    public function update(Request $request, Customer $customer)
    {
        $customer->update($request->validate($this->rules()));

        return $customer->fresh();
    }

    public function destroy(Customer $customer)
    {
        $customer->delete();

        return response()->noContent();
    }

    private function rules(): array
    {
        return ['name' => ['required', 'string', 'max:150'], 'email' => ['nullable', 'email'], 'phone' => ['required', 'string', 'max:40'], 'address' => ['nullable', 'string'], 'date_of_birth' => ['nullable', 'date'], 'license_number' => ['nullable', 'string'], 'license_expiry' => ['nullable', 'date'], 'identification_information' => ['nullable', 'string'], 'notes' => ['nullable', 'string']];
    }
}
