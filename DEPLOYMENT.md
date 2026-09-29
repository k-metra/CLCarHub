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
