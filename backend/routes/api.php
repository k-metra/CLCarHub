<?php

use App\Http\Controllers\Api\AppointmentController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BookingController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\VehicleController;
use App\Http\Middleware\EnsureRole;
use Illuminate\Support\Facades\Route;

Route::post('/auth/login', [AuthController::class, 'login']);
Route::get('/vehicles', [VehicleController::class, 'index']);
Route::get('/vehicles/{vehicle}', [VehicleController::class, 'show']);
Route::get('/vehicles/{vehicle}/availability', [VehicleController::class, 'availability']);

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/auth/user', [AuthController::class, 'user']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::middleware(EnsureRole::class.':owner,it_management')->group(function () {
        Route::apiResource('vehicles', VehicleController::class)->except(['index', 'show']);
    });
    Route::apiResource('customers', CustomerController::class);
    Route::apiResource('bookings', BookingController::class);
    Route::apiResource('appointments', AppointmentController::class);
    Route::middleware(EnsureRole::class.':owner,it_management')->prefix('reports')->group(function () {
        Route::get('/revenue', [ReportController::class, 'revenue']);
        Route::get('/utilization', [ReportController::class, 'utilization']);
        Route::get('/income-flow', [ReportController::class, 'incomeFlow']);
    });
});
