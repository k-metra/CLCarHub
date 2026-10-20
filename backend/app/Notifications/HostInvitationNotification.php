<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class HostInvitationNotification extends Notification
{
    public function __construct(
        private readonly string $activationUrl,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('You are invited to CL CarHub Host Dashboard')
            ->view('emails.host-invitation', [
                'user' => $notifiable,
                'activationUrl' => $this->activationUrl,
            ])
            ->text('emails.host-invitation-text', [
                'user' => $notifiable,
                'activationUrl' => $this->activationUrl,
            ]);
    }
}
