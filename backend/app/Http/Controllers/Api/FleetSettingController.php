<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\FleetSetting;
use App\Services\CustomerBookingSmsService;
use Illuminate\Http\Request;

class FleetSettingController extends Controller
{
    public function legal()
    {
        $settings = FleetSetting::firstOrCreate(['id' => 1]);

        return $settings->only(['terms_and_conditions', 'privacy_policy', 'faqs']);
    }

    public function show()
    {
        return FleetSetting::firstOrCreate(['id' => 1], [
            'reservation_fee' => 0,
            'reservation_fee_deductible' => true,
            'booking_sms_numbers' => [],
            'discount_structures' => [],
            'faqs' => [],
            'default_hour_extension_rate' => 200,
            'full_day_extension_threshold_hours' => 12,
            'late_return_grace_period_minutes' => 60,
            'gps_refresh_interval_seconds' => 30,
            'default_delivery_rate_per_km' => 0,
            'garage_location_name' => null,
            'garage_location_address' => null,
            'garage_location_latitude' => null,
            'garage_location_longitude' => null,
        ]);
    }

    public function update(Request $request)
    {
        $data = $request->validate([
            'reservation_fee' => ['required', 'numeric', 'min:0'],
            'reservation_fee_deductible' => ['required', 'boolean'],
            'booking_sms_numbers' => ['nullable', 'array'],
            'booking_sms_numbers.*' => ['string', 'regex:/^(?:\+63|0)?9\d{9}$/'],
            'discount_structures' => ['nullable', 'array'],
            'discount_structures.*.name' => ['required', 'string', 'max:255'],
            'discount_structures.*.vehicle_types' => ['required', 'array', 'min:1'],
            'discount_structures.*.vehicle_types.*' => ['required', 'string', 'max:50'],
            'discount_structures.*.milestones' => ['required', 'array', 'min:1'],
            'discount_structures.*.milestones.*.days' => ['required', 'integer', 'min:1', 'max:3650'],
            'discount_structures.*.milestones.*.discount_percent' => ['required', 'numeric', 'between:-100,100'],
            'faqs' => ['nullable', 'array', 'max:50'],
            'faqs.*.question' => ['required', 'string', 'max:255'],
            'faqs.*.answer' => ['required', 'string', 'max:5000'],
            'default_hour_extension_rate' => ['nullable', 'numeric', 'min:0'],
            'full_day_extension_threshold_hours' => ['required', 'integer', 'min:1', 'max:23'],
            'late_return_grace_period_minutes' => ['required', 'integer', 'min:0', 'max:1439'],
            'gps_refresh_interval_seconds' => ['required', 'integer', 'min:10', 'max:3600'],
            'default_delivery_rate_per_km' => ['required', 'numeric', 'min:0'],
            'garage_location_name' => ['nullable', 'string', 'max:255'],
            'garage_location_address' => ['nullable', 'string', 'max:1000'],
            'garage_location_latitude' => ['nullable', 'numeric', 'between:-90,90', 'required_with:garage_location_longitude'],
            'garage_location_longitude' => ['nullable', 'numeric', 'between:-180,180', 'required_with:garage_location_latitude'],
            'terms_and_conditions' => ['nullable', 'string', 'max:1000000'],
            'privacy_policy' => ['nullable', 'string', 'max:1000000'],
        ]);

        $normalizer = app(CustomerBookingSmsService::class);
        $data['booking_sms_numbers'] = collect($data['booking_sms_numbers'] ?? [])
            ->map(fn (string $number): ?string => $normalizer->normalizePhone($number))
            ->filter()
            ->unique()
            ->values()
            ->all();

        $settings = FleetSetting::updateOrCreate(['id' => 1], $data);

        return $settings;
    }
}
