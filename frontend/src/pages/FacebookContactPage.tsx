import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../lib/AuthContext";

export default function FacebookContactPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const token = params.get("token") ?? "";
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const sendCode = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/oauth/pending-phone", { token, phone });
      setSent(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to send the verification code.");
    } finally {
      setLoading(false);
    }
  };
  const complete = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post<{ token: string; user: Parameters<typeof setSession>[1]; first_login?: boolean }>("/auth/oauth/complete-pending", { token, code });
      setSession(data.token, data.user);
      if (data.first_login) window.localStorage.setItem(`clcarhub-customer-tour-pending-${data.user.id}`, "1");
      navigate("/onboarding", { replace: true });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to complete Facebook sign-in.");
    } finally {
      setLoading(false);
    }
  };
  return <main className="flex min-h-screen items-center justify-center bg-[#0b0b0b] px-5 text-white"><section className="w-full max-w-md bg-[#151515] p-8 shadow-2xl"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ff641f]">Facebook sign-in</p><h1 className="mt-3 text-3xl font-semibold">Verify your mobile number</h1><p className="mt-3 text-sm leading-6 text-[#aaa]">Facebook did not provide an email address. Verify a Philippine mobile number to finish creating your customer account.</p>{error && <p className="mt-5 border border-red-300/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}<form className="mt-7 space-y-4" onSubmit={sent ? complete : sendCode}><label className="block text-sm text-[#bbb]">Mobile number<input className="mt-2 w-full border border-white/10 bg-[#0d0d0d] px-4 py-3 text-white" inputMode="tel" value={phone} onChange={event => setPhone(event.target.value)} placeholder="09XXXXXXXXX or +639XXXXXXXXX" disabled={sent} required /></label>{sent && <label className="block text-sm text-[#bbb]">6-digit verification code<input className="mt-2 w-full border border-white/10 bg-[#0d0d0d] px-4 py-3 text-white" inputMode="numeric" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} required /></label>}<button disabled={loading || (sent && code.length !== 6)} className="w-full bg-[#ff641f] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{loading ? "Please wait..." : sent ? "Finish Facebook sign-in" : "Send verification code"}</button></form>{sent && <button type="button" className="mt-4 text-sm text-[#ffb18e]" onClick={() => { setSent(false); setCode(""); }}>Use a different number</button>}</section></main>;
}
