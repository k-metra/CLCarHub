<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DiscountCode;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class DiscountCodeController extends Controller
{
    public function index()
    {
        return DiscountCode::withCount('redemptions')->with('customers:id,name')->latest()->get()
            ->each(fn (DiscountCode $code) => $code->setAttribute('effective_status', app(\App\Services\DiscountCodeService::class)->effectiveStatus($code)));
    }

    public function store(Request $request)
    {
        [$data, $customerIds] = $this->validated($request);
        $discountCode = DiscountCode::create($data);
        $discountCode->customers()->sync($customerIds);

        return response()->json($discountCode->fresh('customers'), 201);
    }

    public function update(Request $request, DiscountCode $discountCode)
    {
        [$data, $customerIds] = $this->validated($request, $discountCode);
        $discountCode->update($data);
        $discountCode->customers()->sync($customerIds);

        return $discountCode->fresh('customers');
    }

    public function destroy(DiscountCode $discountCode)
    {
        $discountCode->delete();
        return response()->noContent();
    }

    private function validated(Request $request, ?DiscountCode $discountCode = null): array
    {
        $normalizedCode = strtoupper(trim((string) $request->input('code')));
        $request->merge(['code' => $normalizedCode]);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'code' => ['required', 'string', 'max:80', 'alpha_dash'],
            'type' => ['required', 'in:fixed,percentage'],
            'value' => ['required', 'numeric', 'min:0'],
            'maximum_discount' => ['nullable', 'numeric', 'min:0'],
            'redemptions_allowed' => ['nullable', 'integer', 'min:1'],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date', 'after:starts_at'],
            'minimum_booking_amount' => ['nullable', 'numeric', 'min:0'],
            'vehicle_types' => ['nullable', 'array'],
            'vehicle_types.*' => ['string', 'max:50'],
            'minimum_duration_hours' => ['nullable', 'integer', 'min:1'],
            'new_customers_only' => ['boolean'],
            'stackable' => ['boolean'],
            'status' => ['required', 'in:draft,scheduled,active,paused,expired,exhausted'],
            'limit_per_customer' => ['required', 'integer', 'min:1'],
            'customer_ids' => ['nullable', 'array'],
            'customer_ids.*' => ['integer', 'exists:customers,id'],
        ]);
        $duplicate = DiscountCode::query()
            ->whereRaw('LOWER(code) = ?', [strtolower($normalizedCode)])
            ->when($discountCode, fn ($query) => $query->where('id', '<>', $discountCode->id))
            ->exists();
        if ($duplicate) {
            throw ValidationException::withMessages([
                'code' => 'That discount code is already in use.',
            ]);
        }

        $customerIds = $data['customer_ids'] ?? [];
        unset($data['customer_ids']);
        $data['code'] = strtoupper(trim($data['code']));

        return [$data, $customerIds];
    }
}
