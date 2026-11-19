<?php

namespace App\Notifications;

use App\Models\Booking;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class PosPaymentInvoiceNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly Booking $booking,
        private readonly float $amount,
        private readonly string $paymentMethod,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $this->booking->loadMissing('payments', 'vehicle');
        $paid = (float) $this->booking->payments->sum('amount');
        $balance = max(0, (float) $this->booking->total_amount - $paid);

        return (new MailMessage)
            ->subject('Service invoice for '.$this->booking->reference)
            ->view('emails.pos-service-invoice', [
                'booking' => $this->booking,
                'amount' => $this->amount,
                'paymentMethod' => $this->paymentMethod,
                'paid' => $paid,
                'balance' => $balance,
            ])
            ->text('emails.pos-service-invoice-text', [
                'booking' => $this->booking,
                'amount' => $this->amount,
                'paymentMethod' => $this->paymentMethod,
                'paid' => $paid,
                'balance' => $balance,
            ]);
    }
}
