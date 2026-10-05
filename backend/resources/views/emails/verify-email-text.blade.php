CL CarHub email verification

Hi {{ $user->first_name ?: $user->name }},

Please verify your email address to finish setting up your CL CarHub account:
{{ $verificationUrl }}

This verification link expires in {{ $expiresIn }} minutes. If you did not create a CL CarHub account, you can safely ignore this email.
