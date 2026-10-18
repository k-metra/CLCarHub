<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>CL CarHub Host invitation</title></head>
<body style="margin:0;background:#f4f2ef;color:#151515;font-family:Arial,Helvetica,sans-serif;">
<div style="padding:32px 16px;"><div style="margin:0 auto;max-width:600px;background:#fff;border:1px solid #e6e2dd;">
<div style="padding:28px 32px;background:#151515;color:#fff;"><div style="font-size:24px;font-weight:700;">CL <span style="color:#ff641f;">CarHub</span></div><div style="margin-top:8px;color:#b8b8b8;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;">Host Partnership Program</div></div>
<div style="padding:36px 32px;"><p style="margin:0;color:#777;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">You are invited</p><h1 style="margin:12px 0 16px;font-size:30px;line-height:1.15;">Welcome to the CL CarHub Host Dashboard.</h1><p style="margin:0 0 20px;font-size:16px;line-height:1.6;">Hi {{ $user->first_name ?: $user->name }}, your CL CarHub partner account is ready. Set your password to access your vehicles, contracts, bookings, earnings, and payouts.</p><p style="margin:0 0 28px;"><a href="{{ $activationUrl }}" style="display:inline-block;background:#ff641f;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 22px;">Activate Host Dashboard</a></p><p style="margin:0;color:#777;font-size:13px;line-height:1.6;">This invitation link expires in 7 days. If you were not expecting this invitation, you can safely ignore this email.</p><p style="margin:24px 0 0;color:#999;font-size:12px;line-height:1.6;word-break:break-all;">If the button does not work, copy and paste this URL into your browser:<br>{{ $activationUrl }}</p></div>
<div style="padding:20px 32px;border-top:1px solid #eee;color:#999;font-size:12px;">© {{ date('Y') }} CL CarHub</div>
</div></div>
</body></html>
