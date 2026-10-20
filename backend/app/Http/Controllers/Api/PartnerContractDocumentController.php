<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Partner;
use App\Models\PartnerContractDocument;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

class PartnerContractDocumentController extends Controller
{
    public function store(Request $request, Partner $partner)
    {
        $data = $request->validate([
            'files' => ['required', 'array', 'min:1'],
            'files.*' => ['required', 'file', 'mimes:jpg,jpeg,png,webp,pdf', 'max:20480'],
        ], [
            'files.required' => 'Select at least one contract document to upload.',
            'files.*.uploaded' => 'A contract document could not be uploaded. Each file must be 20 MB or smaller, and the total upload must be 30 MB or smaller.',
            'files.*.mimes' => 'Contract documents must be JPG, PNG, WEBP, or PDF files.',
            'files.*.max' => 'Each contract document must be 20 MB or smaller.',
        ]);

        foreach ($data['files'] as $file) {
            /** @var UploadedFile $file */
            $path = $file->store('partner-contracts', 'public');
            abort_unless(is_string($path) && Storage::disk('public')->exists($path), 500, 'The contract document could not be saved. Check storage permissions and disk configuration.');
            $partner->contractDocuments()->create([
                'path' => $path,
                'original_name' => $file->getClientOriginalName(),
                'mime_type' => $file->getMimeType() ?: 'application/octet-stream',
            ]);
        }

        return $partner->fresh('contractDocuments');
    }

    public function destroy(Partner $partner, PartnerContractDocument $partnerContractDocument)
    {
        abort_unless($partnerContractDocument->partner_id === $partner->id, 404);
        Storage::disk('public')->delete($partnerContractDocument->path);
        $partnerContractDocument->delete();

        return response()->noContent();
    }
}
