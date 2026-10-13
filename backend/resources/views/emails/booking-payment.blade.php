<!DOCTYPE html>
<html lang="en">
<body style="font-family:Arial,Helvetica,sans-serif;color:#151515;">
<h1>Payment received</h1>
<p>Thank you. Your payment for booking <strong>{{ $booking->reference }}</strong> was received.</p>
<p>Your booking is now <strong>upcoming</strong>. The payment has been applied to your booking balance.</p>
<p>You can review your booking and payment history at <a href="{{ rtrim(config('app.frontend_url', env('FRONTEND_URL', config('app.url'))), '/') }}/account">CL CarHub</a>.</p>
</body>
</html>
