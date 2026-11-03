<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('social_accounts')
            ->where('provider', 'facebook')
            ->whereNotNull('provider_profile_url')
            ->orderBy('id')
            ->chunkById(100, function ($accounts): void {
                foreach ($accounts as $account) {
                    $legacyUrl = 'https://www.facebook.com/'.$account->provider_user_id;
                    if ($account->provider_profile_url !== $legacyUrl) {
                        continue;
                    }

                    DB::table('social_accounts')
                        ->where('id', $account->id)
                        ->update([
                            'provider_profile_url' => null,
                        ]);
                }
            });
    }

    public function down(): void
    {
        // The previous URL format did not reliably resolve Facebook profiles.
    }
};
