<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Fund;
use App\Models\FundTransaction;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

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

    public function transfer(Request $request)
    {
        $data = $request->validate([
            'source_fund_id' => ['required', 'integer', 'different:destination_fund_id', 'exists:funds,id'],
            'destination_fund_id' => ['required', 'integer', 'exists:funds,id'],
            'transacted_at' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $transferId = (string) Str::uuid();
        $transactions = DB::transaction(function () use ($data, $transferId, $request): array {
            $funds = Fund::query()
                ->whereIn('id', [(int) $data['source_fund_id'], (int) $data['destination_fund_id']])
                ->orderBy('id')
                ->lockForUpdate()
                ->get()
                ->keyBy('id');
            $source = $funds->get((int) $data['source_fund_id']);
            $destination = $funds->get((int) $data['destination_fund_id']);
            abort_unless($source && $destination, 404, 'Both funds must exist.');

            $balance = (float) $source->opening_balance
                + (float) $source->transactions()->where('type', 'inflow')->sum('amount')
                - (float) $source->transactions()->where('type', 'outflow')->sum('amount');
            abort_if((float) $data['amount'] > $balance, 422, 'The source fund does not have enough available balance.');

            $description = "Transfer {$transferId}";
            $common = [
                'transacted_at' => $data['transacted_at'],
                'amount' => $data['amount'],
                'notes' => trim(($data['notes'] ?? '')."\nTransfer ID: {$transferId}"),
                'transfer_reference' => $transferId,
                'created_by' => $request->user()?->id,
            ];
            return [
                FundTransaction::create([...$common, 'fund_id' => $source->id, 'type' => 'outflow', 'description' => "Transfer to {$destination->name}"])->load('fund'),
                FundTransaction::create([...$common, 'fund_id' => $destination->id, 'type' => 'inflow', 'description' => "Transfer from {$source->name}"])->load('fund'),
            ];
        });

        return response()->json(['transactions' => $transactions], 201);
    }

    public function updateTransaction(Request $request, FundTransaction $transaction)
    {
        abort_if($transaction->transfer_reference, 422, 'Fund transfer transactions cannot be edited as standalone transactions.');
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
        abort_if($transaction->transfer_reference, 422, 'Fund transfer transactions cannot be deleted as standalone transactions.');
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
