import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import api from "../lib/api";
import { Button, Eyebrow } from "../components/Ui";
import { accountPath, useAuth } from "../lib/AuthContext";

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading, setSession } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState(() => new URLSearchParams(window.location.search).get("register") === "1");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [verified] = useState(() => new URLSearchParams(window.location.search).get("verified") === "1");
  const [resendingVerification, setResendingVerification] = useState(false);
  const [verificationResent, setVerificationResent] = useState(false);
  const [vehicleId] = useState(() => new URLSearchParams(window.location.search).get("vehicle_id") ?? "");
  const [legalConsent, setLegalConsent] = useState(false);
  const [oauthLoading, setOauthLoading] = useState("");
  const apiBaseUrl = (import.meta.env.VITE_API_URL ?? "http://localhost:8000/api").replace(/\/+$/, "");
  const oauthCode = new URLSearchParams(window.location.search).get("oauth_code");
  const oauthError = new URLSearchParams(window.location.search).get("oauth_error") || (
    window.location.search.includes("oauth_error=")
      ? "Google sign-in could not be completed. Check the backend log for the exact error."
      : ""
  );
  const oauthReturnTo = new URLSearchParams(window.location.search).get("return_to");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("verified") === "1") {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);
  useEffect(() => {
    if (!oauthCode) return;
    api.post<{
      token: string;
      user: Parameters<typeof setSession>[1];
    }>("/auth/oauth/exchange", { code: oauthCode })
      .then(({ data }) => {
        setSession(data.token, data.user);
        const returnUrl = oauthReturnTo?.startsWith("/") && !oauthReturnTo.startsWith("//") ? oauthReturnTo : "";
        navigate(returnUrl || (data.user.role === "customer" && vehicleId ? `/account?tab=request&vehicle_id=${vehicleId}` : accountPath(data.user)), { replace: true });
      })
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Unable to complete social sign in"))
  }, [navigate, oauthCode, oauthReturnTo, setSession, vehicleId]);
  const startOAuth = (provider: "google" | "facebook") => {
    setOauthLoading(provider);
    window.location.assign(`${apiBaseUrl}/auth/${provider}/redirect?return_to=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setVerificationResent(false);
    setLoading(true);
    try {
      if (registering) {
        if (!legalConsent) {
          setError("Please agree to the Terms and Conditions and Privacy Policy to create an account.");
          return;
        }
        await api.post("/auth/register", {
          username,
          email,
          password,
          password_confirmation: passwordConfirmation,
          phone: phone || undefined,
        });
        setRegistering(false);
        setError(
          "Registration complete. Check your email to verify your account.",
        );
        return;
      }
      const { data } = await api.post<{
        token: string;
        user: Parameters<typeof setSession>[1];
      }>("/auth/login", { email, password });
      setSession(data.token, data.user);
      const pickupAt = new URLSearchParams(window.location.search).get("pickup_at");
      const returnAt = new URLSearchParams(window.location.search).get("return_at");
      navigate(data.user.role === "customer" && vehicleId ? `/account?tab=request&vehicle_id=${vehicleId}&pickup_at=${encodeURIComponent(pickupAt ?? "")}&return_at=${encodeURIComponent(returnAt ?? "")}` : accountPath(data.user));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to sign in",
      );
    } finally {
      setLoading(false);
    }
  }
  async function resendVerification() {
    setResendingVerification(true);
    setVerificationResent(false);
    try {
      await api.post("/auth/resend-verification", { email });
      setVerificationResent(true);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to resend the verification email",
      );
    } finally {
      setResendingVerification(false);
    }
  }
  if (authLoading) return null;
  if (user) return <Navigate to={accountPath(user)} replace />;
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b0b0b] px-5 text-white">
      <div className="w-full max-w-[430px] border border-white/[.1] bg-[#151515] p-8 shadow-2xl md:p-10">
        <Link className="inline-block" to="/" aria-label="CLCarHub home">
          <img src="/clcarhublogo_upscaled.png" alt="CLCarHub" className="h-20 w-32 object-contain object-left" />
        </Link>
        <div className="mt-10">
          {verified && (
            <p className="mb-6 border border-emerald-300/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
              Your email has been verified. You can now sign in.
            </p>
          )}
          <div className="mb-8 flex border-b border-white/[.1]">
            <button
              className={`flex-1 pb-3 text-sm ${!registering ? "border-b-2 border-[#ff641f] text-white" : "text-[#777]"}`}
              onClick={() => {
                setRegistering(false);
                setError("");
              }}
            >
              Sign in
            </button>
            <button
              className={`flex-1 pb-3 text-sm ${registering ? "border-b-2 border-[#ff641f] text-white" : "text-[#777]"}`}
              onClick={() => {
                setRegistering(true);
                setError("");
              }}
            >
              Create account
            </button>
          </div>
          <Eyebrow>
            {registering ? "CUSTOMER ACCOUNT" : "CL CARHUB ACCOUNT"}
          </Eyebrow>
          <h1 className="mt-4 font-['Space_Grotesk'] text-3xl font-semibold tracking-[-1.5px] sm:text-4xl sm:tracking-[-2px]">
            {registering ? "Start your journey." : "Welcome back."}
          </h1>
          <p className="mt-3 text-sm text-[#888]">
            {registering
              ? "Create an account to manage your rentals."
              : "Sign in to manage your rentals or portal."}
          </p>
          {oauthError && <p className="mt-5 border border-red-300/30 bg-red-500/10 p-3 text-sm text-red-200">{oauthError}</p>}
        </div>
        {!registering && <div className="mt-8 space-y-3">
          <button type="button" className="flex min-h-14 w-full items-center gap-4 rounded-md bg-[#1877f2] px-5 text-left text-sm font-bold text-white shadow-sm transition hover:bg-[#166fe5] focus:outline-none focus:ring-2 focus:ring-[#1877f2] focus:ring-offset-2 focus:ring-offset-[#151515] disabled:cursor-not-allowed disabled:opacity-50" onClick={() => startOAuth("facebook")} disabled={!!oauthLoading || !!oauthCode}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-2xl font-bold leading-none text-[#1877f2]" aria-hidden="true">f</span>
            <span>{oauthLoading === "facebook" ? "Connecting..." : oauthCode ? "Signing you in..." : "Continue with Facebook"}</span>
          </button>
          <button type="button" className="flex min-h-14 w-full items-center gap-4 rounded-md border border-black/10 bg-white px-5 text-left text-sm font-bold text-[#5f6368] shadow-sm transition hover:bg-[#f8f9fa] focus:outline-none focus:ring-2 focus:ring-[#4285f4] focus:ring-offset-2 focus:ring-offset-[#151515] disabled:cursor-not-allowed disabled:opacity-50" onClick={() => startOAuth("google")} disabled={!!oauthLoading || !!oauthCode}>
            <svg className="h-7 w-7 shrink-0" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.35 12.23c0-.71-.06-1.4-.18-2.05H12v3.88h5.24a4.48 4.48 0 0 1-1.94 2.94v2.42h3.13c1.84-1.69 2.92-4.18 2.92-7.19Z" /><path fill="#34A853" d="M12 21.6c2.63 0 4.84-.87 6.45-2.37l-3.13-2.42c-.87.58-1.98.92-3.32.92-2.55 0-4.71-1.72-5.49-4.04H3.27v2.5A9.75 9.75 0 0 0 12 21.6Z" /><path fill="#FBBC05" d="M6.51 13.69a5.86 5.86 0 0 1 0-3.38v-2.5H3.27a9.75 9.75 0 0 0 0 8.38l3.24-2.5Z" /><path fill="#EA4335" d="M12 6.27c1.43 0 2.72.49 3.74 1.46l2.8-2.8C16.84 3.33 14.63 2.4 12 2.4a9.75 9.75 0 0 0-8.73 5.41l3.24 2.5C7.29 7.99 9.45 6.27 12 6.27Z" /></svg>
            <span>{oauthLoading === "google" ? "Connecting..." : oauthCode ? "Signing you in..." : "Continue with Google"}</span>
          </button>
        </div>}
        <form className="mt-8 space-y-5" onSubmit={submit}>
          {registering && (
            <>
              <label className="block text-xs text-[#aaa]">
                Username
                <input
                  className="mt-2 w-full border border-white/[.12] bg-[#0d0d0d] px-4 py-3 text-sm text-white outline-none focus:border-[#ff641f]"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                />
              </label>
              <label className="block text-xs text-[#aaa]">
                Phone number <span className="text-[#666]">(optional)</span>
                <input
                  className="mt-2 w-full border border-white/[.12] bg-[#0d0d0d] px-4 py-3 text-sm text-white outline-none focus:border-[#ff641f]"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </label>
            </>
          )}
          <label className="block text-xs text-[#aaa]">
            Email address
            <input
              className="mt-2 w-full border border-white/[.12] bg-[#0d0d0d] px-4 py-3 text-sm text-white outline-none focus:border-[#ff641f]"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="block text-xs text-[#aaa]">
            Password
            <input
              className="mt-2 w-full border border-white/[.12] bg-[#0d0d0d] px-4 py-3 text-sm text-white outline-none focus:border-[#ff641f]"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {registering && (
            <label className="block text-xs text-[#aaa]">
              Confirm password
              <input
                className="mt-2 w-full border border-white/[.12] bg-[#0d0d0d] px-4 py-3 text-sm text-white outline-none focus:border-[#ff641f]"
                type="password"
                value={passwordConfirmation}
                onChange={(event) =>
                  setPasswordConfirmation(event.target.value)
                }
                required
              />
            </label>
          )}
          {registering && (
            <label className="flex items-start gap-3 text-xs leading-5 text-[#aaa]">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0 accent-[#ff641f]"
                checked={legalConsent}
                onChange={event => setLegalConsent(event.target.checked)}
                required
              />
              <span>
                I agree to the{" "}
                <Link className="text-[#ff641f] underline hover:text-[#ff9b73]" to="/terms" target="_blank" rel="noreferrer">Terms and Conditions</Link>
                {" "}and acknowledge that I have read the{" "}
                <Link className="text-[#ff641f] underline hover:text-[#ff9b73]" to="/privacy" target="_blank" rel="noreferrer">Privacy Policy</Link>.
              </span>
            </label>
          )}
          {error && <p className="text-xs text-[#ff8b68]">{error}</p>}
          {!registering && error.toLowerCase().includes("verify your email") && (
            <div className="space-y-2 border border-[#ff641f]/30 bg-[#ff641f]/10 p-3 text-sm">
              <p className="text-[#f5c1ad]">Need another verification link?</p>
              <button
                type="button"
                className="font-semibold text-[#ff9b73] underline disabled:opacity-50"
                disabled={resendingVerification || !email}
                onClick={() => void resendVerification()}
              >
                {resendingVerification ? "Sending..." : "Resend verification email"}
              </button>
              {verificationResent && <p className="text-xs text-emerald-300">If your account is eligible, a new verification email is on its way.</p>}
            </div>
          )}
          <Button disabled={registering && !legalConsent}>
            {loading
              ? "Please wait..."
              : registering
                ? "Create account"
                : "Sign in"}{" "}
            <span className="ml-3">→</span>
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-[#888]">
          Already have an account?{" "}
          <button type="button" className="text-[#ff641f] underline hover:text-[#ff9b73]" onClick={() => { setRegistering(false); setError(""); }}>
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
