<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use App\Observers\AuditObserver;
use App\Models\{Appointment, Booking, BookingStatusHistory, Contract, Customer, CustomerAttachment, Expense, FleetSetting, Fund, FundTransaction, Partner, Payment, User, Vehicle, VehicleImage, VehicleMaintenance};

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        foreach ([Appointment::class, Booking::class, BookingStatusHistory::class, Contract::class, Customer::class, CustomerAttachment::class, Expense::class, FleetSetting::class, Fund::class, FundTransaction::class, Partner::class, Payment::class, User::class, Vehicle::class, VehicleImage::class, VehicleMaintenance::class] as $model) {
            $model::observe(AuditObserver::class);
        }
    }
}
