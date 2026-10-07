<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Support\Facades\RateLimiter;
use App\Observers\AuditObserver;
use App\Models\{Appointment, Booking, BookingStatusHistory, Contract, Customer, CustomerAttachment, Expense, FleetSetting, Fund, FundTransaction, IpBlock, Partner, Payment, User, Vehicle, VehicleImage, VehicleMaintenance};

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
        RateLimiter::for('customer-booking-submissions', function ($request) {
            return Limit::perMinute(5)->by('booking-ip:'.$request->ip());
        });

        foreach ([Appointment::class, Booking::class, BookingStatusHistory::class, Contract::class, Customer::class, CustomerAttachment::class, Expense::class, FleetSetting::class, Fund::class, FundTransaction::class, IpBlock::class, Partner::class, Payment::class, User::class, Vehicle::class, VehicleImage::class, VehicleMaintenance::class] as $model) {
            $model::observe(AuditObserver::class);
        }
    }
}
