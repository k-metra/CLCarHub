<?php

use App\Http\Controllers\Api\AppointmentController;
use App\Http\Controllers\Api\AccountController;
use App\Http\Controllers\Api\ContractController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BookingController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\ExpenseController;
use App\Http\Controllers\Api\FundController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\VehicleController;
use App\Http\Controllers\Api\PartnerController;
use App\Http\Middleware\EnsureRole;
use Illuminate\Support\Facades\Route;

Route::post('/auth/login', [AuthController::class, 'login']);
Route::post('/auth/register', [AuthController::class, 'register']);
Route::get('/vehicles', [VehicleController::class, 'index']);
Route::get('/vehicles/availability', [VehicleController::class, 'available']);
Route::get('/vehicles/{vehicle}', [VehicleController::class, 'show']);
Route::get('/vehicles/{vehicle}/availability', [VehicleController::class, 'availability']);

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/auth/user', [AuthController::class, 'user']);
    Route::get('/dashboard', [DashboardController::class, 'index']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::middleware(EnsureRole::class.':owner,it_management')->group(function () {
        Route::apiResource('vehicles', VehicleController::class)->except(['index', 'show']);
        Route::post('/vehicles/{vehicle}/image', [VehicleController::class, 'uploadImage']);
        Route::post('/vehicles/{vehicle}/restore', [VehicleController::class, 'restore']);
        Route::apiResource('partners', PartnerController::class);
    });
    Route::apiResource('customers', CustomerController::class);
    Route::get('/accounts', [AccountController::class, 'index']);
    Route::middleware(EnsureRole::class.':owner,co_owner,it_management')->apiResource('accounts', AccountController::class)->only(['store', 'update', 'destroy']);
    Route::delete('/customers/{customer}/attachments/{attachment}', [CustomerController::class, 'destroyAttachment']);
    Route::apiResource('bookings', BookingController::class);
    Route::apiResource('contracts', ContractController::class)->only(['index', 'store', 'show', 'update', 'destroy']);
    Route::apiResource('expenses', ExpenseController::class)->only(['index', 'store', 'update', 'destroy']);
    Route::apiResource('funds', FundController::class)->only(['index', 'store', 'update', 'destroy']);
    Route::post('/funds/{fund}/transactions', [FundController::class, 'storeTransaction']);
    Route::patch('/fund-transactions/{transaction}', [FundController::class, 'updateTransaction']);
    Route::delete('/fund-transactions/{transaction}', [FundController::class, 'destroyTransaction']);
    Route::apiResource('appointments', AppointmentController::class);
    Route::middleware(EnsureRole::class.':owner,co_owner,it_management')->prefix('reports')->group(function () {
        Route::get('/revenue', [ReportController::class, 'revenue']);
        Route::get('/vehicle-revenue', [ReportController::class, 'vehicleRevenue']);
        Route::get('/utilization', [ReportController::class, 'utilization']);
        Route::get('/income-flow', [ReportController::class, 'incomeFlow']);
    });
});
