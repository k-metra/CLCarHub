<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Partner;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PartnerController extends Controller
{
    public function index()
    {
        return Partner::withCount('vehicles')->latest()->paginate(50);
    }

    public function store(Request $request)
    {
        return response()->json(Partner::create($request->validate($this->rules())), 201);
    }

    public function show(Partner $partner)
    {
        return $partner->loadCount('vehicles');
    }

    public function update(Request $request, Partner $partner)
    {
        $partner->update($request->validate($this->rules()));

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
            'name' => ['required', 'string', 'max:150'],
            'email' => ['required', 'email', 'max:255'],
            'contact_number' => ['required', 'string', 'max:40'],
            'address' => ['required', 'string'],
            'commission_based_on' => ['required', Rule::in(['base_rent_only', 'total_booking_amount'])],
            'commission_type' => ['required', Rule::in(['percentage', 'fixed_amount'])],
            'commission_value' => ['required', 'numeric', 'min:0'],
        ];
    }
}
