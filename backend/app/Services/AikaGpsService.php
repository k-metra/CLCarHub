<?php

namespace App\Services;

use App\Models\Vehicle;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;
use Throwable;

class AikaGpsService
{
    public function location(Vehicle $vehicle): array
    {
        $startedAt = microtime(true);

        try {
            return $this->fetchLocation($vehicle);
        } catch (Throwable $exception) {
            Log::warning('Aika GPS request failed', [
                'vehicle_id' => $vehicle->id,
                'operation' => 'location',
                'duration_ms' => (int) round((microtime(true) - $startedAt) * 1000),
                'exception' => get_class($exception),
                'message' => $exception->getMessage(),
            ]);

            throw $exception;
        }
    }

    private function fetchLocation(Vehicle $vehicle): array
    {
        $deviceId = $vehicle->aika_device_id;
        abort_unless($deviceId, 422, 'Aika GPS is not configured for this vehicle.');

        $password = $vehicle->aika_device_password
            ?: config('services.aika.devices.'.$deviceId.'.password');
        abort_unless($password, 503, 'Aika GPS credentials are not configured for this vehicle.');

        $server = rtrim((string) config('services.aika.server', 'https://en.aika168.com'), '/');
        $appAddress = trim($this->client(15)->get($server.'/getapp.aspx')->throw()->body());
        abort_if($appAddress === '', 503, 'Aika GPS did not provide an application endpoint.');
        $appAddress = rtrim($appAddress, '/');

        $login = $this->request($appAddress, 'Login', [
            'Name' => $deviceId,
            'Pass' => $password,
            'LoginType' => 1,
            'LoginAPP' => 'AKSH',
            'GMT' => '2:00',
            'Key' => '7DU2DJFDR8321',
        ]);
        $deviceInfo = $login['deviceInfo'] ?? null;
        $key = is_array($deviceInfo) ? ($deviceInfo['key2018'] ?? null) : null;
        $resolvedDeviceId = is_array($deviceInfo) ? ($deviceInfo['deviceID'] ?? $deviceId) : $deviceId;
        abort_unless($key, 502, 'Aika GPS login did not return a session key.');

        $tracking = $this->request($appAddress, 'GetTracking', [
            'DeviceID' => $resolvedDeviceId,
            'Model' => is_array($deviceInfo) ? ($deviceInfo['model'] ?? '') : '',
            'TimeZones' => '2:00',
            'MapType' => 'Google',
            'Language' => 'en',
            'Key' => $key,
        ]);

        $latitude = $tracking['lat'] ?? null;
        $longitude = $tracking['lng'] ?? null;
        abort_unless(is_numeric($latitude) && is_numeric($longitude), 502, 'Aika GPS returned no usable vehicle location.');

        return [
            'vehicle_id' => $vehicle->id,
            'device_id' => $deviceId,
            'latitude' => (float) $latitude,
            'longitude' => (float) $longitude,
            'speed' => isset($tracking['speed']) ? (float) $tracking['speed'] : null,
            'position_time' => $tracking['positionTime'] ?? null,
            'is_gps' => (int) ($tracking['isGPS'] ?? 0) === 1,
            'is_stopped' => (int) ($tracking['isStop'] ?? 0) === 1,
            'battery' => isset($tracking['battery']) ? (int) $tracking['battery'] : null,
            'fetched_at' => now()->toIso8601String(),
        ];
    }

    private function request(string $appAddress, string $endpoint, array $payload): array
    {
        $body = $this->client(20)->asForm()->post($appAddress.'/'.$endpoint, $payload)->throw()->body();
        $xml = @simplexml_load_string($body);
        $json = $xml?->__toString();
        $decoded = is_string($json) ? json_decode($json, true) : null;
        if (! is_array($decoded)) {
            throw new RuntimeException('Aika GPS returned an invalid response.');
        }

        return $decoded;
    }

    private function client(int $timeout)
    {
        $client = Http::timeout($timeout);
        $caBundle = config('services.aika.ca_bundle');

        return is_string($caBundle) && $caBundle !== ''
            ? $client->withOptions(['verify' => $caBundle])
            : $client;
    }
}
