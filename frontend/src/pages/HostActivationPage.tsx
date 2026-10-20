import { useState, type FormEvent } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import api from "../lib/api";

export default function HostActivationPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api.post("/auth/host/activate", { token: params.get("token"), password, password_confirmation: confirmation });
      setMessage("Your host account is active. You can now sign in.");
      setTimeout(() => navigate("/admin/login"), 1200);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to activate account");
    }
  };
  return <main className="flex min-h-screen items-center justify-center bg-[#171717] p-6"><form className="theme-surface w-full max-w-md border border-white/10 bg-[#242424] p-8 text-[#f4f3f0] shadow-2xl" onSubmit={submit}><p className="text-[10px] font-bold uppercase tracking-[2px] text-[#ff641f]">Host access</p><h1 className="mt-2 text-2xl font-semibold">Activate Host Dashboard</h1><p className="mt-2 text-sm text-[#c4c3be]">Create a password to access your partner dashboard.</p><label className="mt-6 block text-sm font-medium">Password<input className="mt-2 w-full border border-white/20 bg-[#303030] p-3 text-[#f4f3f0]" type="password" minLength={8} value={password} onChange={event => setPassword(event.target.value)} required /></label><label className="mt-4 block text-sm font-medium">Confirm password<input className="mt-2 w-full border border-white/20 bg-[#303030] p-3 text-[#f4f3f0]" type="password" minLength={8} value={confirmation} onChange={event => setConfirmation(event.target.value)} required /></label>{error && <p className="mt-4 text-sm text-red-400">{error}</p>}{message && <p className="mt-4 text-sm text-green-400">{message}</p>}<button className="mt-6 w-full bg-[#ff641f] p-3 font-bold text-white hover:bg-[#e95716]">Activate account</button></form></main>;
}
