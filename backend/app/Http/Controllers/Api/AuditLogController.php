<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AuditLogController extends Controller
{
    public function index(Request $request)
    {
        $data = $request->validate([
            'category' => ['nullable', Rule::in(['account', 'dashboard'])],
            'action' => ['nullable', 'string', 'max:50'],
            'search' => ['nullable', 'string', 'max:100'],
            'sort' => ['nullable', Rule::in(['latest', 'oldest'])],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]);

        $query = AuditLog::with('user:id,name,email,role')
            ->when($data['category'] ?? null, fn ($q, $category) => $q->where('category', $category))
            ->when($data['action'] ?? null, fn ($q, $action) => $q->where('action', $action))
            ->when($data['search'] ?? null, fn ($q, $search) => $q->where(fn ($inner) => $inner
                ->where('description', 'like', "%{$search}%")
                ->orWhereHas('user', fn ($user) => $user->where('name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%"))))
            ->orderBy('created_at', ($data['sort'] ?? 'latest') === 'oldest' ? 'asc' : 'desc');

        return $query->paginate($data['per_page'] ?? 20);
    }
}
