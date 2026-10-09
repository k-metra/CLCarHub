<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\FleetSetting;
use Illuminate\Http\Request;

class FleetSettingController extends Controller
{
    public function legal()
    {
        $settings = FleetSetting::firstOrCreate(['id' => 1]);

        return $settings->only(['terms_and_conditions', 'privacy_policy']);
    }

    public function show()
    {
        return FleetSetting::firstOrCreate(['id' => 1], [
            'reservation_fee' => 0,
            'reservation_fee_deductible' => true,
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

        $settings = FleetSetting::updateOrCreate(['id' => 1], $data);

        return $settings;
    }
}
