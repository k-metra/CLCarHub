# CL CarHub deployment guide

## Recommended Hostinger VPS stack

- Ubuntu LTS
- Nginx
- PHP 8.3 or newer with `mysql`, `mbstring`, `xml`, `curl`, `zip`, `bcmath`, `fileinfo`, and `intl`
- Composer 2
- Node.js 20 or newer for the frontend build
- MySQL 8 or MariaDB 10.6+
- HTTPS with a valid certificate

The repository contains a Laravel API in `backend/` and a separately built React/Vite frontend in `frontend/`.

If Composer reports that `ext-curl` is missing on an Ubuntu/Debian server,
install the cURL extension for the PHP version used by the server. For PHP
8.4:

```bash
sudo apt update
sudo apt install php8.4-curl
sudo systemctl restart php8.4-fpm
php -m | grep -i '^curl$'
```

The last command must print `curl`. If it does not, check `php --ini` and
ensure the CLI PHP and PHP-FPM versions match. Then retry Composer from the
backend directory:

```bash
composer install --no-dev --optimize-autoloader
```

Do not use `--ignore-platform-req=ext-curl` in production; Web Push requires
the cURL extension to communicate with push services.

Uploaded images are limited to 20 MB per file. The backend includes
`backend/public/.user.ini` for PHP-FPM, with a 30 MB request allowance for
multipart overhead and multiple files. If Nginx is configured with a request
body limit, set it to at least 30 MB as well:

```nginx
client_max_body_size 30m;
```

Reload PHP-FPM and Nginx after changing these limits. The application returns
a user-friendly 413 response when an upload exceeds the configured request
size.

## MySQL setup

Create a dedicated database and user. Do not use the MySQL `root` account from the application:

```sql
CREATE DATABASE clcarhub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'clcarhub_user'@'localhost' IDENTIFIED BY 'replace-with-a-long-random-password';
GRANT ALL PRIVILEGES ON clcarhub.* TO 'clcarhub_user'@'localhost';
FLUSH PRIVILEGES;
```

Copy `backend/.env.example` to `backend/.env` and set:

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://api.example.com
FRONTEND_URL=https://example.com
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=clcarhub
DB_USERNAME=clcarhub_user
DB_PASSWORD=...
FILESYSTEM_DISK=public
```

Generate an application key only once:

```bash
php artisan key:generate --force
```

Run migrations without destructive refresh commands:

```bash
php artisan migrate --force
php artisan storage:link
```

`FILESYSTEM_DISK` should be `public` in the production `.env`:

```dotenv
FILESYSTEM_DISK=public
```

Vehicle and customer images are stored under
`backend/storage/app/public`. The web server must serve the Laravel
`backend/public/storage` symlink at `/storage/*`; it must not send those
requests to the React `index.html` fallback.

Uploaded files are not stored in Git and are not recreated by
`php artisan migrate` or a code deployment. Never delete or replace
`backend/storage/app/public` when deploying a new backend release. Copy code
files separately, or exclude the persistent storage directory:

```bash
rsync -a --delete \
  --exclude='.env' \
  --exclude='storage/app/public/' \
  /path/to/new/backend/ /var/www/clcarhub/backend/
```

Back up `backend/storage/app/public` before every deployment. This directory
contains vehicle and customer uploads and must be restored separately if it
was removed.

After deployment, verify the link and file access:

```bash
ls -la /var/www/clcarhub/backend/public/storage
test -f /var/www/clcarhub/backend/storage/app/public/vehicles/example.png
curl -I https://clcarhub.my.to/storage/vehicles/example.png
```

The image response should be `200` with an image content type, not the
frontend HTML document. If `storage` is missing, recreate the link:

```bash
php artisan storage:link
```

If the API still returns image records but the image URLs return `404`, check
whether the stored file exists:

```bash
find /var/www/clcarhub/backend/storage/app/public/vehicles -type f | head
find /var/www/clcarhub/backend/storage/app/public/customers -type f | head
```

If those directories are empty, restore them from the VPS backup. Recreating
the symlink alone cannot recover deleted uploads. The database rows contain
the stored paths, so once the original files are restored at those paths, the
existing image URLs work again.

For an Nginx setup serving the frontend from the main domain, add a specific
`/storage/` location before the SPA fallback. Point it at the Laravel public
storage directory:

```nginx
location ^~ /storage/ {
    alias /var/www/clcarhub/backend/storage/app/public/;
}
```

With `alias`, do not append `try_files $uri` in this location; it can resolve
the URI against the wrong filesystem path. Confirm that the Nginx worker can
traverse and read the files:

```bash
namei -l /var/www/clcarhub/backend/storage/app/public/vehicles
sudo -u www-data test -r /var/www/clcarhub/backend/storage/app/public/vehicles/<file>.png
readlink -f /var/www/clcarhub/backend/public/storage
```

The final command must output:

```text
/var/www/clcarhub/backend/storage/app/public
```

After uploading a test image, compare the API path with the filesystem:

```bash
curl -s https://clcarhub.my.to/api/vehicles?per_page=1
ls -l /var/www/clcarhub/backend/storage/app/public/vehicles
curl -I https://clcarhub.my.to/storage/vehicles/<path-from-api>.png
```

If the file exists locally but the last command returns `404`, the Nginx
configuration is wrong or has not been reloaded:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Email verification links are Laravel web routes, not frontend routes. Route
`/email/verify/` to Laravel before the React fallback as well:

```nginx
location ^~ /email/verify/ {
    try_files $uri $uri/ /index.php?$query_string;
}
```

The Laravel PHP location must point to `backend/public/index.php`. Do not route
email verification links to the React `index.html` fallback. After changing
Nginx, run `sudo nginx -t && sudo systemctl reload nginx`.

If the API is hosted under the same domain, `/api/` must likewise be routed
to Laravel rather than the frontend fallback. A separate API subdomain is
often simpler to configure and maintain.

The frontend service worker deliberately bypasses `/api/*` requests, and the
Laravel API sends `Cache-Control: no-store` headers so booking and dashboard
responses cannot be served from browser or proxy caches. If Nginx adds custom
cache rules, do not cache the `/api/` location.

### Background push notifications

The admin notification menu can subscribe the current browser or installed PWA
to background push notifications. Generate VAPID keys once in the backend:

```bash
composer install --no-dev --optimize-autoloader
php artisan tinker
```

Then run:

```php
\Minishlink\WebPush\VAPID::createVapidKeys();
```

If Tinker reports that the class cannot be found, run
`composer dump-autoload --optimize` from `backend/` and retry. The
`minishlink/web-push` dependency must be installed on the production server;
deploy both `composer.json` and `composer.lock`.

Copy the returned `publicKey` and `privateKey` into
`WEB_PUSH_PUBLIC_KEY` and `WEB_PUSH_PRIVATE_KEY` in `backend/.env`, then run
`php artisan migrate --force` and `php artisan config:cache`. Push delivery is
best-effort; in-app polling remains the source of truth. Users enable
**Background push notifications** from the admin notification menu after
granting browser notification permission.

## Create the first owner account

After configuring the production `.env` and running migrations, create the first
administrator account with Laravel Tinker:

```bash
cd /var/www/clcarhub/backend
php artisan tinker
```

Then run the following, replacing the values with a unique email and a strong
password:

```php
$user = new App\Models\User();
$user->name = 'CL CarHub Owner';
$user->username = 'owner';
$user->email = 'owner@clcarhub.my.to';
$user->password = 'replace-with-a-long-random-password';
$user->role = 'owner';
$user->status = 'active';
$user->email_verified_at = now();
$user->save();
```

The `User` model hashes passwords automatically. Exit Tinker with `exit`.
The account can then sign in at `/admin/login`.

Do not use the committed development password from `DatabaseSeeder.php` on a
public server. If you use the seeder for local development, change that
password afterward and never expose it in production.

## Deploying the Laravel API

```bash
cd /var/www/clcarhub/backend
composer install --no-dev --optimize-autoloader
php artisan config:cache
php artisan route:cache
php artisan view:cache
sudo chown -R www-data:www-data storage bootstrap/cache
sudo chmod -R ug+rwx storage bootstrap/cache
```

Point Nginx to `backend/public`, not the repository root. The API must be served over HTTPS and should be protected by the VPS firewall.

## Deploying the frontend

Set the production API URL before building:

```bash
cd /var/www/clcarhub/frontend
printf 'VITE_API_URL=https://api.example.com/api\n' > .env.production
npm ci
npm run build
```

Serve `frontend/dist` from the frontend domain. Configure the web server to fall back to `index.html` for React Router routes.

## Important production checks

- Set `APP_DEBUG=false`; never expose Laravel stack traces publicly.
- Use a long, unique database password and keep `.env` outside version control.
- Rotate any credentials that have ever been placed in a local `.env` or shared in logs.
- Configure CORS/Sanctum for the actual frontend domain, not localhost.
- Back up MySQL and `backend/storage/app/public` independently.
- Use a process supervisor for queued jobs if queue processing is enabled.
- Configure a real SMTP provider and verify outbound mail before enabling account verification.
- Confirm server time is correct; the application uses `Asia/Manila`.
- Test uploads, storage URLs, login, booking creation, payment updates, and status transitions after deployment.

## Moving existing SQLite data

Changing `DB_CONNECTION` does not migrate existing SQLite rows. Export/import the data separately, or use a one-time migration script after creating the MySQL schema. Take a backup first and verify row counts for customers, vehicles, bookings, payments, attachments, and status histories.
