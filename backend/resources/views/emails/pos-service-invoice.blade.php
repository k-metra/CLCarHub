<!DOCTYPE html>
<html lang="en">
<body style="font-family:Arial,Helvetica,sans-serif;color:#151515;">
<h1>Service invoice</h1>
<p>Payment received for booking <strong>{{ $booking->reference }}</strong>.</p>
<p><strong>Payment:</strong> ₱{{ number_format($amount, 2) }} ({{ $paymentMethod }})</p>
<p><strong>Total paid:</strong> ₱{{ number_format($paid, 2) }}<br>
<strong>Remaining balance:</strong> ₱{{ number_format($balance, 2) }}</p>
<p>Thank you for choosing CL CarHub.</p>
</body>
</html>
