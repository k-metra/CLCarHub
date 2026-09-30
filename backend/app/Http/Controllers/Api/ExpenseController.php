<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Expense;
use App\Models\FundTransaction;
use Illuminate\Http\Request;

class ExpenseController extends Controller
{
    public function index(Request $request)
    {
        $sort = $request->input('sort', 'date_latest');
        $query = Expense::with(['vehicle', 'fund'])
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

        $expense = Expense::create($data);
        $this->syncFundTransaction($expense);
        return response()->json($expense->load(['vehicle', 'fund']), 201);
    }

    public function update(Request $request, Expense $expense)
    {
        $data = $this->normalize($request->validate($this->rules()));
        $expense->update($data);
        $this->syncFundTransaction($expense);

        return $expense->fresh(['vehicle', 'fund']);
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
            'fund_id' => ['nullable', 'exists:funds,id'],
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
        FundTransaction::where('expense_id', $expense->id)->delete();
        $expense->delete();

        return response()->noContent();
    }

    private function syncFundTransaction(Expense $expense): void
    {
        if (! $expense->fund_id) {
            FundTransaction::where('expense_id', $expense->id)->delete();
            return;
        }

        FundTransaction::updateOrCreate(
            ['expense_id' => $expense->id],
            ['fund_id' => $expense->fund_id, 'type' => 'outflow', 'transacted_at' => $expense->spent_at, 'amount' => $expense->amount, 'description' => $expense->description, 'notes' => $expense->expense_type, 'created_by' => $expense->created_by],
        );
    }
}
