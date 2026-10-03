<?php

namespace App\Support;

use App\Models\AuditLog;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class AuditLogger
{
    public static function record(
        string $category,
        string $action,
        string $description,
        ?Model $auditable = null,
        ?array $changes = null,
        ?Request $request = null,
    ): AuditLog {
        $request ??= app()->bound('request') ? request() : null;

        return AuditLog::create([
            'user_id' => $request?->user()?->id,
            'category' => $category,
            'action' => $action,
            'auditable_type' => $auditable?->getMorphClass(),
            'auditable_id' => $auditable?->getKey(),
            'description' => $description,
            'changes' => $changes,
            'ip_address' => $request?->ip(),
            'user_agent' => $request?->userAgent(),
        ]);
    }

    public static function model(Model $model, string $action): void
    {
        if ($model instanceof \App\Models\AuditLog) return;
        $category = $model instanceof \App\Models\User || $model instanceof \App\Models\Customer ? 'account' : 'dashboard';
        $changes = $model->getChanges();
        unset($changes['password'], $changes['remember_token']);
        if ($model instanceof \App\Models\User && array_keys($changes) === ['last_login_at']) return;
        if ($action === 'updated' && !$changes) return;
        self::record($category, $action, self::description($model, $action), $model, $changes ?: null);
    }

    private static function description(Model $model, string $action): string
    {
        $name = class_basename($model);
        $label = $model->getAttribute('name') ?? $model->getAttribute('reference') ?? ($model->getKey() ? "#{$model->getKey()}" : 'record');
        return "{$name} {$action}: {$label}";
    }
}
