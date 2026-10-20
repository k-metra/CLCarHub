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
        $uploadErrors = collect($request->allFiles()['files'] ?? [])
            ->filter(fn ($file): bool => $file instanceof UploadedFile && ! $file->isValid())
            ->map(fn (UploadedFile $file): string => sprintf(
                '%s (PHP error %d; upload_max_filesize=%s; post_max_size=%s)',
                $file->getClientOriginalName(),
                $file->getError(),
                ini_get('upload_max_filesize'),
                ini_get('post_max_size'),
            ))
            ->values();

        if ($uploadErrors->isNotEmpty()) {
            return response()->json([
                'message' => 'PHP rejected the upload before Laravel could receive it.',
                'errors' => ['files' => $uploadErrors->all()],
            ], 422);
        }

        $data = $request->validate([
            'files' => ['required', 'array', 'min:1'],
            'files.*' => ['required', 'file', 'mimes:jpg,jpeg,png,webp,pdf', 'max:20480'],
        ], [
            'files.required' => 'Select at least one contract document to upload.',
            'files.*.uploaded' => 'PHP rejected this upload before Laravel could receive it. Check the active PHP upload_max_filesize and post_max_size settings.',
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
