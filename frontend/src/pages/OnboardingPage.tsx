import { useState, type FormEvent, type ReactNode } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import api from "../lib/api";
import { Button } from "../components/Ui";
import { ThemeToggle, useTheme } from "../lib/ThemeContext";
import { displayName, useAuth } from "../lib/AuthContext";

const referralOptions = [
  ["facebook", "Facebook"],
  ["tiktok", "TikTok"],
  ["google_search", "Google Search"],
  ["word_of_mouth", "Word of Mouth"],
] as const;
type RequirementCategory = "license" | "ltms" | "secondary_id" | "selfie_license";
const requirements: Array<[RequirementCategory, string, number]> = [
  ["license", "Driver's license (front & back)", 2],
  ["secondary_id", "Secondary ID", 2],
  ["ltms", "LTMS portal photos", 4],
  ["selfie_license", "Selfie with driver's license", 1],
];

export default function OnboardingPage() {
  const { user, loading, updateUser } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ first_name: user?.first_name ?? "", last_name: user?.last_name ?? "", date_of_birth: user?.customer?.date_of_birth?.slice(0, 10) ?? user?.date_of_birth?.slice(0, 10) ?? "", address: user?.customer?.address ?? "", phone: user?.customer?.phone ?? "", referral_source: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [files, setFiles] = useState<Record<RequirementCategory, File[]>>({ license: [], secondary_id: [], ltms: [], selfie_license: [] });
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneSent, setPhoneSent] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(Boolean(user?.customer?.phone_verified_at));
  const [phoneLoading, setPhoneLoading] = useState(false);

  if (loading) return null;
  if (!user) return <Navigate to="/admin/login" replace />;
  if (user.role !== "customer") return <Navigate to="/admin" replace />;
  if (user.customer?.onboarding_completed_at) return <Navigate to="/account" replace />;

  const update = (field: keyof typeof form, value: string) => {
    setForm(current => ({ ...current, [field]: value }));
    if (field === "phone") {
      setPhoneSent(false);
      setPhoneVerified(false);
      setPhoneCode("");
    }
  };
  const sendPhoneCode = async () => {
    if (!form.phone.trim()) {
      setError("Enter your phone number first.");
      return;
    }
    setPhoneLoading(true);
    setError("");
    try {
      const response = await api.post<{ phone: string }>("/customer/onboarding/phone/send", { phone: form.phone });
      update("phone", response.data.phone);
      setPhoneSent(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to send the verification code.");
    } finally {
      setPhoneLoading(false);
    }
  };
  const verifyPhoneCode = async () => {
    setPhoneLoading(true);
    setError("");
    try {
      await api.post("/customer/onboarding/phone/verify", { code: phoneCode });
      setPhoneVerified(true);
      setPhoneSent(false);
      setPhoneCode("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to verify your phone number.");
    } finally {
      setPhoneLoading(false);
    }
  };
  const next = () => {
    setError("");
    if (step === 1 && (!form.first_name.trim() || !form.last_name.trim())) return setError("Enter your first and last name.");
    if (step === 2 && form.address.trim().length < 5) return setError("Enter your complete home address.");
    if (step === 3 && form.phone.trim() && !/^[+0-9][0-9 ()-]{6,38}$/.test(form.phone.trim())) return setError("Enter a valid phone number or leave it blank.");
    if (step === 3 && !phoneVerified) return setError("Verify your phone number or choose Skip to continue.");
    setStep(current => Math.min(4, current + 1));
  };
  const finish = async (skipRequirements: boolean) => {
    if (!form.referral_source) {
      setError("Choose how you heard about CL CarHub.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (!skipRequirements) {
        const selectedFiles = requirements.flatMap(([category, , limit]) => files[category].slice(0, limit).map(file => ({ category, file })));
        if (selectedFiles.length) {
          const payload = new FormData();
          selectedFiles.forEach(({ category, file }, index) => {
            payload.append(`attachments[${index}][category]`, category);
            payload.append(`attachments[${index}][file]`, file);
          });
          const attachmentResponse = await api.post("/customer/onboarding/attachments", payload);
          updateUser({ customer: attachmentResponse.data });
        }
      }
      const response = await api.post("/customer/onboarding", form);
      updateUser(response.data);
      setCompleted(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to save your onboarding details.");
    } finally {
      setSaving(false);
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (step === 5) {
      void finish(false);
      return;
    }
    if (step === 4) {
      if (!form.referral_source) {
        setError("Choose how you heard about CL CarHub.");
        return;
      }
      setStep(5);
      return;
    }
  };

  const returnTo = searchParams.get("return_to");
  return <div className={`dashboard-theme min-h-screen bg-[#f4f3f0] text-[#151515] ${theme === "dark" ? "theme-dark" : ""}`}>
    <header className="bg-[#111] px-5 pb-6 pt-8 text-white sm:px-8 sm:py-5">
      <div className="mx-auto flex max-w-3xl items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[2px] text-white/65">CL CarHub</p><p className="mt-2 text-lg font-semibold">Welcome, {displayName(user).split(" ")[0]}</p></div><ThemeToggle /></div>
    </header>
    <main className="mx-auto max-w-3xl px-5 pb-12 pt-8 sm:px-8 sm:pt-12">
      {completed && <section className="rounded-2xl border border-black/10 bg-white p-8 text-center shadow-sm sm:p-12"><p className="text-4xl" aria-hidden="true">✓</p><h1 className="mt-5 font-['Space_Grotesk'] text-3xl font-semibold">You're all set!</h1><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#777]">Your profile is ready. Start exploring vehicles and find the perfect ride for your next trip.</p><Button onClick={() => { const destination = returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/account"; navigate(`${destination}${destination.includes("?") ? "&" : "?"}tutorial=1`); }}>Explore vehicles →</Button></section>}
      {!completed && <>
      <div className="mb-8 flex items-center gap-2" aria-label={`Onboarding step ${step} of 4`}>{[1, 2, 3, 4].map(item => <span key={item} className={`h-1.5 flex-1 rounded-full ${item <= step ? "bg-[#ff641f]" : "bg-black/10"}`} />)}</div>
      <form onSubmit={submit} className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm sm:p-8">
        {step === 1 && <Step title="Let's get to know you" description="Tell us a little about yourself so we can make your CL CarHub experience smoother."><div className="grid gap-4 sm:grid-cols-2"><Field label="First name" value={form.first_name} onChange={value => update("first_name", value)} /><Field label="Last name" value={form.last_name} onChange={value => update("last_name", value)} /><label className="block text-sm font-semibold sm:col-span-2">Date of birth <span className="font-normal text-[#777]">(optional)</span><input type="date" className="mt-2 w-full border border-black/10 px-3 py-3 font-normal outline-none focus:border-[#ff641f]" value={form.date_of_birth} onChange={event => update("date_of_birth", event.target.value)} /></label></div></Step>}
        {step === 2 && <Step title="Where are you based?" description="Provide your home address to help us maintain accurate customer records."><label className="block text-sm font-semibold">Home address<textarea required rows={5} value={form.address} onChange={event => update("address", event.target.value)} className="mt-2 w-full resize-y border border-black/10 px-3 py-3 font-normal outline-none focus:border-[#ff641f]" placeholder="House/unit, street, barangay, city or municipality, province" /></label></Step>}
        {step === 3 && <Step title="Stay connected" description="Add your mobile number so we can contact you about your bookings and reservations. Phone verification is optional."><label className="block text-sm font-semibold">Mobile number<div className="mt-2 flex"><span className="flex items-center border border-r-0 border-black/10 bg-black/5 px-3 text-sm font-semibold text-[#555]">+63</span><input aria-label="Mobile number" inputMode="tel" className="min-w-0 flex-1 border border-black/10 px-3 py-3 font-normal outline-none focus:border-[#ff641f]" value={form.phone.replace(/^\+63\s*/, "")} onChange={event => update("phone", event.target.value)} placeholder="9XX XXX XXXX" /></div></label><div className="mt-4 flex flex-col gap-3 sm:flex-row"><button type="button" disabled={phoneLoading || phoneVerified} onClick={() => void sendPhoneCode()} className="border border-[#ff641f] px-4 py-3 text-sm font-bold text-[#d94f12] disabled:opacity-50">{phoneVerified ? "Phone verified" : phoneLoading ? "Sending..." : phoneSent ? "Resend code" : "Send verification code"}</button>{phoneVerified && <span className="flex items-center text-sm font-semibold text-emerald-700">✓ Verified</span>}</div>{phoneSent && !phoneVerified && <div className="mt-4 flex gap-2"><input aria-label="Phone verification code" inputMode="numeric" pattern="[0-9]*" maxLength={6} className="w-full border border-black/10 px-3 py-3 outline-none focus:border-[#ff641f]" value={phoneCode} onChange={event => setPhoneCode(event.target.value.replace(/\D/g, ""))} placeholder="6-digit code" /><button type="button" disabled={phoneLoading || phoneCode.length !== 6} onClick={() => void verifyPhoneCode()} className="shrink-0 bg-[#ff641f] px-4 py-3 text-sm font-bold text-white disabled:opacity-50">Verify</button></div>}<p className="mt-3 text-xs leading-5 text-[#777]">You can skip this for now and add or verify your number later in your profile settings.</p></Step>}
        {step === 4 && <Step title="How did you hear about us?" description="We'd love to know how you discovered CL CarHub."><div className="grid gap-3 sm:grid-cols-2">{referralOptions.map(([value, label]) => <button type="button" key={value} onClick={() => update("referral_source", value)} className={`rounded-xl border p-4 text-left text-sm font-semibold transition ${form.referral_source === value ? "border-[#ff641f] bg-[#fff7f3] text-[#d94f12] ring-1 ring-[#ff641f]" : "border-black/10 hover:border-[#ff641f]"}`} aria-pressed={form.referral_source === value}>{label}</button>)}</div></Step>}
        {step === 5 && <Step title="Complete your booking requirements" description="Upload your documents now to make future booking requests smoother. You can skip this and provide them later."><div className="space-y-4">{requirements.map(([category, label, limit]) => <label key={category} className="block rounded-xl border border-black/10 p-4 text-sm font-semibold">{label}<span className="mt-1 block text-xs font-normal text-[#777]">Up to {limit} image{limit === 1 ? "" : "s"}</span><input type="file" accept="image/*" multiple={limit > 1} className="mt-3 w-full text-xs" onChange={event => setFiles(current => ({ ...current, [category]: Array.from(event.target.files ?? []).slice(0, limit) }))} />{files[category].length > 0 && <span className="mt-2 block text-xs font-normal text-emerald-700">{files[category].length} file{files[category].length === 1 ? "" : "s"} selected</span>}</label>)}</div></Step>}
        {error && <p className="mt-5 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
        <div className="mt-8 flex items-center justify-between gap-3"><button type="button" className={`text-sm font-semibold text-[#777] ${step === 1 ? "invisible" : ""}`} onClick={() => { setError(""); setStep(current => current - 1); }}>Back</button>{step < 3 ? <Button type="button" onClick={next}>Continue →</Button> : step === 3 ? <div className="flex items-center gap-3"><button type="button" onClick={() => { setError(""); setStep(4); }} className="px-3 py-3 text-sm font-semibold text-[#777] hover:text-[#151515]">Skip</button><Button type="button" disabled={!phoneVerified} onClick={next}>Continue →</Button></div> : step === 4 ? <Button type="submit">Continue →</Button> : <div className="flex items-center gap-3"><button type="button" disabled={saving} onClick={() => void finish(true)} className="px-3 py-3 text-sm font-semibold text-[#777] hover:text-[#151515] disabled:opacity-50">Skip</button><Button type="submit" disabled={saving}>{saving ? "Saving..." : "Continue →"}</Button></div>}</div>
      </form></>}
    </main>
  </div>;
}

function Step({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <div><p className="text-xs font-bold uppercase tracking-[2px] text-[#ff641f]">Step</p><h1 className="mt-2 font-['Space_Grotesk'] text-3xl font-semibold">{title}</h1><p className="mt-3 max-w-xl text-sm leading-6 text-[#777]">{description}</p><div className="mt-8">{children}</div></div>;
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="block text-sm font-semibold">{label}<input required className="mt-2 w-full border border-black/10 px-3 py-3 font-normal outline-none focus:border-[#ff641f]" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} /></label>;
}
