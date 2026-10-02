<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

class CustomerController extends Controller
{
    public function profile(Request $request)
    {
        return $request->user()?->customer?->load('attachments')
            ?? response()->json(['message' => 'Your account is not linked to a customer profile.'], 404);
    }

    public function index(Request $request)
    {
        $customers = Customer::with(['attachments', 'bookings' => fn ($query) => $query
            ->whereNotIn('status', ['cancelled', 'rejected'])
            ->with('payments')])
            ->withCount(['bookings' => fn ($query) => $query->whereNotIn('status', ['cancelled', 'rejected'])])
            ->when($request->search, fn ($q, $s) => $q->where(fn ($q) => $q->where('name', 'like', "%$s%")->orWhere('email', 'like', "%$s%")->orWhere('phone', 'like', "%$s%")))
            ->latest()
            ->paginate(min(100, max(1, (int) $request->input('per_page', 15))));

        $customers->getCollection()->transform(function (Customer $customer) {
            $customer->setAttribute('outstanding_balance', $customer->bookings->sum(fn ($booking) => $booking->balance));
            $customer->unsetRelation('bookings');

            return $customer;
        });

        return $customers;
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

    public function show(Customer $customer)
    {
        return $customer->load(['bookings.vehicle', 'attachments']);
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
        $customer->delete();

        return response()->noContent();
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
        return ['name' => ['nullable', 'string', 'max:150'], 'first_name' => ['nullable', 'string', 'max:100'], 'middle_name' => ['nullable', 'string', 'max:100'], 'last_name' => ['nullable', 'string', 'max:100'], 'email' => ['nullable', 'email'], 'phone' => ['required', 'string', 'max:40'], 'address' => ['nullable', 'string'], 'date_of_birth' => ['nullable', 'date'], 'license_number' => ['nullable', 'string'], 'license_expiry' => ['nullable', 'date'], 'identification_information' => ['nullable', 'string'], 'notes' => ['nullable', 'string'], 'attachments' => ['nullable', 'array'], 'attachments.*.category' => ['required', 'in:license,ltms,proof_of_billing,secondary_id,selfie_license'], 'attachments.*.file' => ['required', 'image', 'max:20480']];
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
        $limits = ['license' => 2, 'ltms' => 4, 'proof_of_billing' => 5, 'secondary_id' => 3, 'selfie_license' => 1];
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
