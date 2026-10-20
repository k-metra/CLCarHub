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

For local development on Windows, start the backend with the Composer command
below rather than `php artisan serve`. The command uses
`backend/php-development.ini` so the PHP web-server child process also receives
the upload limits:

```powershell
cd backend
composer serve
```

If port 8000 is already in use, stop the old Laravel/PHP server first. Only
one backend should be listening on port 8000; otherwise the frontend may call
an older server process that still has PHP's default 2 MB upload limit.

Laravel serves the dynamic sitemap at `/sitemap.xml`. It queries available
vehicles from the database, so future public vehicle pages are included
automatically without a frontend rebuild. Because the frontend and API share
the `clcarhub.com` domain, route `/sitemap.xml` to Laravel before the React
SPA fallback in Nginx:

```nginx
location = /sitemap.xml {
    try_files $uri $uri/ /index.php?$query_string;
}
```

The public host partnership page is also server-rendered by Laravel at
`/host-partnership` for SEO. Route it to Laravel before the React SPA fallback:

```nginx
location = /host-partnership {
    try_files $uri $uri/ /index.php?$query_string;
}
```

Do not keep a static `frontend/public/sitemap.xml`, because it can intercept
the request before Laravel and prevent future vehicles from appearing.

For PayMongo hosted checkout, set `PAYMONGO_SECRET_KEY` and
`PAYMONGO_WEBHOOK_SECRET` in the backend production `.env`. Configure the
PayMongo webhook endpoint as
`https://clcarhub.com/api/payments/paymongo/webhook` and subscribe to
`checkout_session.payment.paid`. Keep both values server-side and never commit
them.

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
`backend/public/.user.ini` for PHP-FPM, with a 60 MB request allowance and a
50 MB PHP transfer allowance so the server-level limit does not reject files
before Laravel can validate them. If Nginx is configured with a request body
limit, set it to at least 60 MB as well:

```nginx
client_max_body_size 60m;
```

Reload PHP-FPM and Nginx after changing these limits. The production workflow
reloads the detected PHP-FPM service after deployment so `.user.ini` changes
take effect. The application returns a user-friendly 413 response when an
upload exceeds the configured request size.

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
FRONTEND_URL=https://example.com,https://www.example.com
SANCTUM_STATEFUL_DOMAINS=example.com,www.example.com
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

The fleet settings migration creates the global reservation fee configuration
and removes the old per-vehicle reservation fee column. Configure it after
deployment from the admin sidebar under **Fleet Management → Fleet Settings**.

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
rsync -a --delete --no-perms --no-owner --no-group --omit-dir-times \
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
curl -I https://clcarhub.com/storage/vehicles/example.png
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
curl -s https://clcarhub.com/api/vehicles?per_page=1
ls -l /var/www/clcarhub/backend/storage/app/public/vehicles
curl -I https://clcarhub.com/storage/vehicles/<path-from-api>.png
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

Public vehicle detail pages are rendered by Laravel for SEO. Route them to
Laravel before the React fallback, while keeping `/vehicles` itself on the
frontend fleet page:

```nginx
location ^~ /vehicles/ {
    try_files $uri $uri/ /index.php?$query_string;
}
```

This ensures URLs such as `/vehicles/7` return the vehicle-specific title,
canonical URL, structured data, and content in the initial HTML response.

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

## Automatic production deployment

The repository includes a GitHub Actions workflow at
`.github/workflows/deploy-production.yml`. Every push to `main` builds the
frontend on GitHub, uploads the built frontend and backend application code over
SSH, then runs Composer, migrations, Laravel cache optimization, permissions,
and Nginx validation on the VPS. It can also be started manually from the
workflow's **Run workflow** action.

The workflow intentionally does not upload or delete these server-owned paths:

- `backend/.env`
- `backend/vendor`
- `backend/storage`
- `backend/public/storage`
- `backend/bootstrap/cache`

This means the production environment file, Composer dependencies, uploaded
images, storage symlink, and generated cache remain on the VPS. The workflow
uses `rsync --delete` only for deployable frontend files and application source
outside those paths.

### One-time VPS setup

Create a deployment account and give it ownership of the application files. The
account needs SSH access and passwordless `sudo` for only the commands used by
the workflow:

```bash
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG www-data deploy
sudo chown -R deploy:www-data /var/www/clcarhub
sudo chmod -R ug+rwX /var/www/clcarhub
```

Create `/etc/sudoers.d/clcarhub-deploy` with `sudo visudo -f
/etc/sudoers.d/clcarhub-deploy`:

```text
deploy ALL=(root) NOPASSWD: /usr/bin/chown -R www-data\:www-data /var/www/clcarhub/backend/storage /var/www/clcarhub/backend/bootstrap/cache /var/www/clcarhub/backend/public, /usr/bin/chmod -R ug+rwx /var/www/clcarhub/backend/storage /var/www/clcarhub/backend/bootstrap/cache /var/www/clcarhub/backend/public, /usr/sbin/nginx -t, /usr/bin/systemctl reload php8.4-fpm, /usr/bin/systemctl reload nginx
```

The exact executable paths can be checked with `command -v chown chmod nginx
systemctl` on the VPS. Replace `php8.4-fpm` with the installed PHP-FPM service
name if the server uses another PHP version. Ensure the deployment account has the expected PHP CLI,
Composer, and Node-independent runtime available; Node is only required by the
GitHub runner because the frontend is built before upload.

### GitHub configuration

Add these secrets to the repository's `production` environment:

- `DEPLOY_HOST`: VPS hostname or IP
- `DEPLOY_USER`: `deploy`
- `DEPLOY_SSH_KEY`: private Ed25519 key whose public key is in
  `/home/deploy/.ssh/authorized_keys`
- `DEPLOY_KNOWN_HOSTS`: output of
  `ssh-keyscan -H your-vps-hostname`
- `VITE_API_URL`: production API URL, for example
  `https://clcarhub.com/api`

Use a dedicated deploy key, not a personal SSH key. Restrict the key in
`authorized_keys` if your SSH policy supports it, and rotate it if it is ever
exposed. Before the first automated deployment, confirm that these commands
work as the deploy account:

```bash
ssh deploy@your-vps-hostname 'cd /var/www/clcarhub/backend && php artisan about'
ssh deploy@your-vps-hostname 'composer --version && php --version'
```

The first push to `main` will then deploy automatically. Review the Actions log
and verify the site, login, an API request, and an uploaded image after the
first run. Keep independent backups of MySQL and
`backend/storage/app/public`; deployment cannot recover deleted uploads.

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
