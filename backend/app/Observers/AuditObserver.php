<?php

namespace App\Observers;

use App\Support\AuditLogger;
use Illuminate\Database\Eloquent\Model;

class AuditObserver
{
    public function created(Model $model): void
    {
        AuditLogger::model($model, 'created');
    }

    public function updated(Model $model): void
    {
        AuditLogger::model($model, 'updated');
    }

    public function deleted(Model $model): void
    {
        AuditLogger::model($model, 'deleted');
    }
}
