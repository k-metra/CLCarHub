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
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("verified") === "1") {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);
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
        </div>
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
