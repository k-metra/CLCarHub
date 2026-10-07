<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use App\Notifications\VerifyEmailNotification;

#[Fillable(['name', 'first_name', 'middle_name', 'last_name', 'date_of_birth', 'username', 'email', 'password', 'role', 'status', 'last_login_ip'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable implements MustVerifyEmail
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    public function sendEmailVerificationNotification(): void
    {
        $this->notify(new VerifyEmailNotification());
    }

    public function isOwner(): bool
    {
        return $this->role === 'owner';
    }

    public function canManageAccounts(): bool
    {
        return in_array($this->role, ['owner', 'co_owner', 'it_management'], true);
    }

    public function canManageRole(string $role): bool
    {
        $manageableRoles = match ($this->role) {
            'owner' => ['co_owner', 'it_management', 'staff'],
            'co_owner' => ['it_management', 'staff'],
            'it_management' => ['staff'],
            default => [],
        };

        return in_array($role, $manageableRoles, true);
    }

    public function customer(): HasOne
    {
        return $this->hasOne(Customer::class);
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'date_of_birth' => 'date',
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'last_login_at' => 'datetime',
        ];
    }
}
