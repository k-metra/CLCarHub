Service invoice for {{ $booking->reference }}.

Payment received: ₱{{ number_format($amount, 2) }} ({{ $paymentMethod }}).
Total paid: ₱{{ number_format($paid, 2) }}.
Remaining balance: ₱{{ number_format($balance, 2) }}.

Thank you for choosing CL CarHub.
