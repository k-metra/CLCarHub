<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Addon;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Support\Str;

class AddonController extends Controller
{
    private const VEHICLE_TYPES = ['sedan', 'motorcycle', 'auv', 'crossover', 'mpv', 'pickup', 'suv', 'van', 'hatchback'];

    public function index(Request $request)
    {
        $sanctumUser = Auth::guard('sanctum')->user();
        abort_unless($request->boolean('available_only') || $sanctumUser, 403, 'Authentication is required to view the add-on catalog.');

        $query = Addon::query()
            ->when($request->filled('vehicle_type'), fn ($query) => $query->whereJsonContains('vehicle_types', $request->string('vehicle_type')->toString()))
            ->when($request->boolean('available_only'), fn ($query) => $query->where('status', 'available')->where(fn ($query) => $query->whereNull('stock')->orWhere('stock', '>', 0)));

        $addons = $request->boolean('available_only') && $request->filled(['pickup_at', 'return_at'])
            ? $query->latest()->get()->filter(fn (Addon $addon) => ! $addon->is_rental || $addon->availableRentalQuantity($request->date('pickup_at'), $request->date('return_at')) > 0)->values()
            : null;

        return $addons !== null
            ? ($request->boolean('paginate') ? $addons->forPage(0, min(100, max(1, (int) $request->input('per_page', 50))))->values() : $addons)
            : ($request->boolean('paginate')
            ? $query->latest()->paginate(min(100, max(1, (int) $request->input('per_page', 50))))
            : $query->latest()->get());
    }

    public function store(Request $request)
    {
        $this->decodeJsonFields($request);
        $data = $request->validate($this->rules());
        $image = $data['image'] ?? null;
        unset($data['image']);
        $data['vehicle_types'] = $this->validatedVehicleTypes($data['vehicle_types']);
        $data['rental_quantity'] = $data['is_rental'] ? (int) ($data['rental_quantity'] ?? 1) : null;
        $data['pricing_tiers'] = $this->validatedPricingTiers($data['pricing_tiers'], (bool) $data['is_rental']);
        $data['status'] = $this->resolvedStatus($data['status'], $data['stock'] ?? null, (bool) $data['is_rental']);
        $data['image_path'] = $this->storeImage($image, (bool) ($data['remove_background'] ?? false));
        unset($data['remove_background']);

        return response()->json(Addon::create($data), 201);
    }

    public function update(Request $request, Addon $addon)
    {
        $this->decodeJsonFields($request);
        $data = $request->validate($this->rules());
        $image = $data['image'] ?? null;
        unset($data['image']);
        $data['vehicle_types'] = $this->validatedVehicleTypes($data['vehicle_types']);
        $data['rental_quantity'] = $data['is_rental'] ? (int) ($data['rental_quantity'] ?? 1) : null;
        $data['pricing_tiers'] = $this->validatedPricingTiers($data['pricing_tiers'], (bool) $data['is_rental']);
        $data['status'] = $this->resolvedStatus($data['status'], $data['stock'] ?? null, (bool) $data['is_rental']);
        $removeBackground = (bool) ($data['remove_background'] ?? false);
        unset($data['remove_background']);
        if ($image) {
            Storage::disk('public')->delete($addon->image_path);
            $data['image_path'] = $this->storeImage($image, $removeBackground);
        }
        $addon->update($data);

        return $addon->fresh();
    }

    public function destroy(Addon $addon)
    {
        Storage::disk('public')->delete($addon->image_path);
        $addon->delete();

        return response()->noContent();
    }

    private function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:120'],
            'description' => ['required', 'string', 'max:5000'],
            'vehicle_types' => ['required', 'array', 'min:1'],
            'vehicle_types.*' => [Rule::in(self::VEHICLE_TYPES)],
            'pricing_tiers' => ['required', 'array', 'min:1'],
            'pricing_tiers.*.from_day' => ['required', 'integer', 'min:1'],
            'pricing_tiers.*.to_day' => ['nullable', 'integer', 'gte:pricing_tiers.*.from_day'],
            'pricing_tiers.*.price' => ['required', 'numeric', 'min:0'],
            'pricing_tiers.*.billing' => ['required', 'in:one_time,per_day'],
            'is_rental' => ['required', 'boolean'],
            'stock' => ['nullable', 'integer', 'min:0', 'required_if:is_rental,false'],
            'rental_quantity' => ['nullable', 'integer', 'min:1', 'required_if:is_rental,true'],
            'status' => ['required', 'in:available,unavailable,out_of_stock'],
            'image' => ['nullable', 'image', 'max:20480'],
            'remove_background' => ['sometimes', 'boolean'],
        ];
    }

    private function decodeJsonFields(Request $request): void
    {
        foreach (['pricing_tiers', 'vehicle_types'] as $field) {
            if (is_string($request->input($field))) {
                $decoded = json_decode($request->input($field), true);
                if (is_array($decoded)) {
                    $request->merge([$field => $decoded]);
                }
            }
        }
    }

    private function validatedVehicleTypes(array $types): array
    {
        $types = array_values(array_unique($types));
        abort_if(count($types) === 0, 422, 'Select at least one vehicle category.');

        return $types;
    }

    private function validatedPricingTiers(array $tiers, bool $isRental): array
    {
        usort($tiers, fn (array $left, array $right) => (int) $left['from_day'] <=> (int) $right['from_day']);
        $previousTo = 0;
        foreach ($tiers as $tier) {
            $from = (int) $tier['from_day'];
            $to = $tier['to_day'] === null ? null : (int) $tier['to_day'];
            abort_if($from <= $previousTo, 422, 'Pricing periods must not overlap and must start after the previous period.');
            abort_if($to !== null && $to < $from, 422, 'A pricing period cannot end before it starts.');
            abort_if(! $isRental && $tier['billing'] !== 'one_time', 422, 'Non-rental add-ons must use one-time pricing.');
            $previousTo = $to ?? PHP_INT_MAX;
        }

        return array_values($tiers);
    }

    private function resolvedStatus(string $status, ?int $stock, bool $isRental): string
    {
        return ! $isRental && $stock === 0 ? 'out_of_stock' : ($status === 'out_of_stock' && $stock !== 0 ? 'available' : $status);
    }

    private function storeImage(?UploadedFile $image, bool $removeBackground = false): ?string
    {
        if (! $image) {
            return null;
        }
        $path = $removeBackground ? $this->removeImageBackground($image) : $image->store('addons', 'public');
        abort_unless(is_string($path) && Storage::disk('public')->exists($path), 500, 'The add-on image could not be saved.');

        return $path;
    }

    private function removeImageBackground(UploadedFile $image): string
    {
        $apiKey = config('services.remove_bg.key');
        abort_if(! is_string($apiKey) || trim($apiKey) === '', 503, 'Background removal is not configured. Disable the option or contact an administrator.');

        $response = Http::timeout(60)
            ->withHeaders(['X-Api-Key' => $apiKey])
            ->attach('image_file', $image->get(), $image->getClientOriginalName())
            ->post('https://api.remove.bg/v1.0/removebg', ['size' => 'auto', 'format' => 'png']);

        if (! $response->successful()) {
            $status = $response->status();
            $message = match ($status) {
                401, 403 => 'The remove.bg API key was rejected. Check the configured key.',
                402 => 'The remove.bg monthly background-removal limit has been reached.',
                default => 'Background removal failed. Disable the option or try a different image.',
            };
            Log::warning('remove.bg add-on background removal failed', [
                'status' => $status,
                'response' => str($response->body())->limit(500)->toString(),
            ]);
            abort(502, $message);
        }

        $path = 'addons/'.Str::uuid().'.png';
        Storage::disk('public')->put($path, $response->body());

        return $path;
    }
}
