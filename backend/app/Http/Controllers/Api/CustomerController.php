<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

class CustomerController extends Controller
{
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
        $attachments = $data['attachments'] ?? [];
        unset($data['attachments']);
        $customer = Customer::create($data);
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
        $attachments = $data['attachments'] ?? [];
        unset($data['attachments']);
        $customer->update($data);
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
        return ['name' => ['required', 'string', 'max:150'], 'email' => ['nullable', 'email'], 'phone' => ['required', 'string', 'max:40'], 'address' => ['nullable', 'string'], 'date_of_birth' => ['nullable', 'date'], 'license_number' => ['nullable', 'string'], 'license_expiry' => ['nullable', 'date'], 'identification_information' => ['nullable', 'string'], 'notes' => ['nullable', 'string'], 'attachments' => ['nullable', 'array'], 'attachments.*.category' => ['required', 'in:license,ltms,proof_of_billing,secondary_id,selfie_license'], 'attachments.*.file' => ['required', 'image', 'max:5120']];
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
