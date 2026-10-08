<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Fund;
use App\Models\FundTransaction;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class FundController extends Controller
{
    public function index(Request $request)
    {
        $sort = $request->input('sort', 'date_latest');
        $funds = Fund::withCount('transactions')->get()->map(fn ($fund) => $this->withBalance($fund));
        $query = FundTransaction::with('fund')
            ->when($request->search, fn ($query, $search) => $query->where(function ($query) use ($search) {
                $query->where('description', 'like', "%{$search}%")->orWhere('notes', 'like', "%{$search}%")
                    ->orWhereHas('fund', fn ($fund) => $fund->where('name', 'like', "%{$search}%"));
            }))
            ->when($request->fund_id, fn ($query, $fundId) => $query->where('fund_id', $fundId))
            ->when($request->type, fn ($query, $type) => $query->where('type', $type));
        match ($sort) {
            'date_oldest' => $query->orderBy('transacted_at'),
            'amount_asc' => $query->orderBy('amount'),
            'amount_desc' => $query->orderByDesc('amount'),
            'type_inflow' => $query->orderByRaw("CASE WHEN type = 'inflow' THEN 0 ELSE 1 END")->orderByDesc('transacted_at'),
            'type_outflow' => $query->orderByRaw("CASE WHEN type = 'outflow' THEN 0 ELSE 1 END")->orderByDesc('transacted_at'),
            default => $query->orderByDesc('transacted_at'),
        };
        $transactions = $query->with('payment')->paginate(50);
        return response()->json([
            'funds' => $funds,
            'transactions' => $transactions->items(),
            'current_page' => $transactions->currentPage(),
            'last_page' => $transactions->lastPage(),
            'total' => $transactions->total(),
            'total_balance' => $funds->sum('balance'),
            'total_inflows' => (float) FundTransaction::where('type', 'inflow')->sum('amount'),
            'total_outflows' => (float) FundTransaction::where('type', 'outflow')->sum('amount'),
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->fundRules());
        $data = $this->storeQrCode($request, $data);
        $data['created_by'] = $request->user()?->id;
        return response()->json($this->withBalance(Fund::create($data)), 201);
    }

    public function update(Request $request, Fund $fund)
    {
        $data = $this->storeQrCode($request, $request->validate($this->fundRules()));
        if (array_key_exists('qr_code_path', $data) && $fund->qr_code_path) {
            Storage::disk('public')->delete($fund->qr_code_path);
        }
        $fund->update($data);
        return $this->withBalance($fund->fresh());
    }

    public function destroy(Fund $fund)
    {
        if ($fund->qr_code_path) Storage::disk('public')->delete($fund->qr_code_path);
        $fund->delete();
        return response()->noContent();
    }

    public function storeTransaction(Request $request, Fund $fund)
    {
        $data = $request->validate($this->transactionRules());
        $data['created_by'] = $request->user()?->id;
        return response()->json(FundTransaction::create([...$data, 'fund_id' => $fund->id])->load('fund'), 201);
    }

    public function updateTransaction(Request $request, FundTransaction $transaction)
    {
        $data = $request->validate($this->transactionRules());
        $transaction->update($data);
        if ($transaction->payment_id) {
            $transaction->payment()->update(['fund_id' => $transaction->fund_id]);
        }
        return $transaction->fresh('fund');
    }

    public function destroyTransaction(FundTransaction $transaction)
    {
        abort_if($transaction->payment?->provider === 'paymongo', 422, 'PayMongo fund transactions cannot be deleted.');
        $transaction->delete();
        return response()->noContent();
    }

    private function withBalance(Fund $fund): Fund
    {
        $inflows = $fund->transactions()->where('type', 'inflow')->sum('amount');
        $outflows = $fund->transactions()->where('type', 'outflow')->sum('amount');
        $fund->setAttribute('balance', (float) $fund->opening_balance + $inflows - $outflows);
        return $fund;
    }

    private function fundRules(): array
    {
        return ['name' => ['required', 'string', 'max:100'], 'type' => ['required', 'in:cash,bank,e-wallet,other'], 'account_name' => ['nullable', 'string', 'max:255'], 'account_number' => ['nullable', 'string', 'max:100'], 'qr_code' => ['nullable', 'image', 'mimes:jpeg,jpg,png,webp,gif', 'max:20480'], 'opening_balance' => ['required', 'numeric', 'min:0'], 'notes' => ['nullable', 'string']];
    }

    private function storeQrCode(Request $request, array $data): array
    {
        if ($request->hasFile('qr_code')) {
            $path = $request->file('qr_code')->store('funds/qr-codes', 'public');
            abort_unless($path && Storage::disk('public')->exists($path), 500, 'The QR code image could not be stored.');
            $data['qr_code_path'] = $path;
        }
        unset($data['qr_code']);
        return $data;
    }

    private function transactionRules(): array
    {
        return ['fund_id' => ['sometimes', 'exists:funds,id'], 'type' => ['required', 'in:inflow,outflow'], 'transacted_at' => ['required', 'date'], 'amount' => ['required', 'numeric', 'min:0.01'], 'description' => ['required', 'string', 'max:255'], 'notes' => ['nullable', 'string']];
    }
}
