<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Expense;
use Illuminate\Http\Request;

class ExpenseController extends Controller
{
    public function index(Request $request)
    {
        $sort = $request->input('sort', 'date_latest');
        $query = Expense::with('vehicle')
            ->when($request->search, function ($query, $search) {
                $query->where(function ($query) use ($search) {
                    $query->where('description', 'like', "%{$search}%")
                        ->orWhere('expense_type', 'like', "%{$search}%")
                        ->orWhereHas('vehicle', fn ($vehicle) => $vehicle
                            ->where('name', 'like', "%{$search}%")
                            ->orWhere('brand', 'like', "%{$search}%")
                            ->orWhere('model', 'like', "%{$search}%")
                            ->orWhere('plate_number', 'like', "%{$search}%"));
                });
            })
            ->when($request->category, fn ($query, $category) => $query->where('category', $category));

        match ($sort) {
            'date_oldest' => $query->orderBy('spent_at'),
            'amount_asc' => $query->orderBy('amount'),
            'amount_desc' => $query->orderByDesc('amount'),
            'category_unit' => $query->orderByRaw("CASE WHEN category = 'unit-related' THEN 0 ELSE 1 END")->orderByDesc('spent_at'),
            'category_general' => $query->orderByRaw("CASE WHEN category = 'general' THEN 0 ELSE 1 END")->orderByDesc('spent_at'),
            default => $query->orderByDesc('spent_at'),
        };

        $expenses = $query->paginate(50);

        return response()->json([
            'data' => $expenses->items(),
            'current_page' => $expenses->currentPage(),
            'last_page' => $expenses->lastPage(),
            'per_page' => $expenses->perPage(),
            'total' => $expenses->total(),
            'total_expenses' => Expense::sum('amount'),
            'car_related' => Expense::where('category', 'unit-related')->sum('amount'),
            'general_expense' => Expense::where('category', 'general')->sum('amount'),
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->rules());
        $data = $this->normalize($data);
        $data['created_by'] = $request->user()?->id;

        return response()->json(Expense::create($data)->load('vehicle'), 201);
    }

    public function update(Request $request, Expense $expense)
    {
        $data = $this->normalize($request->validate($this->rules()));
        $expense->update($data);

        return $expense->fresh('vehicle');
    }

    private function rules(): array
    {
        return [
            'category' => ['required', 'in:unit-related,general'],
            'vehicle_id' => ['nullable', 'required_if:category,unit-related', 'exists:vehicles,id'],
            'expense_type' => ['nullable', 'required_if:category,general', 'string', 'max:100'],
            'spent_at' => ['required', 'date'],
            'description' => ['required', 'string'],
            'amount' => ['required', 'numeric', 'min:0.01'],
        ];
    }

    private function normalize(array $data): array
    {
        if ($data['category'] === 'unit-related') {
            $data['expense_type'] = null;
        } else {
            $data['vehicle_id'] = null;
        }

        return $data;
    }

    public function destroy(Expense $expense)
    {
        $expense->delete();

        return response()->noContent();
    }
}
