<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Appointment;
use Illuminate\Http\Request;

class AppointmentController extends Controller
{
    public function index(Request $request)
    {
        return Appointment::with(['customer', 'vehicle', 'assignedStaff'])->when($request->status, fn ($q, $v) => $q->where('status', $v))->orderBy('scheduled_at')->paginate(15);
    }

    public function store(Request $request)
    {
        return response()->json(Appointment::create($request->validate($this->rules())), 201);
    }

    public function show(Appointment $appointment)
    {
        return $appointment->load(['customer', 'vehicle', 'assignedStaff']);
    }

    public function update(Request $request, Appointment $appointment)
    {
        $appointment->update($request->validate($this->rules(true)));

        return $appointment->fresh(['customer', 'vehicle', 'assignedStaff']);
    }

    public function destroy(Appointment $appointment)
    {
        $appointment->update(['status' => 'cancelled']);

        return response()->noContent();
    }

    private function rules(bool $partial = false): array
    {
        $required = $partial ? 'sometimes' : 'required';

        return ['customer_id' => [$required, 'exists:customers,id'], 'vehicle_id' => ['nullable', 'exists:vehicles,id'], 'assigned_staff_id' => ['nullable', 'exists:users,id'], 'type' => [$required, 'string'], 'scheduled_at' => [$required, 'date'], 'status' => ['sometimes', 'in:pending,confirmed,completed,cancelled,no_show'], 'notes' => ['nullable', 'string']];
    }
}
