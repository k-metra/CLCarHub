import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { Skeleton, useToast } from "../components/Ui";
import { AdminShell } from "../components/AdminShell";
import api from "../lib/api";
import { displayName, useAuth, useSignOut } from "../lib/AuthContext";
import type { CustomerAttachment } from "../types";

type Profile = { id: number; name: string; first_name?: string | null; middle_name?: string | null; last_name?: string | null; date_of_birth?: string | null; username?: string | null; email: string; role: string; email_verified_at?: string | null };
type CustomerProfile = Profile & { phone?: string | null; attachments?: CustomerAttachment[] };
type Category = "license" | "secondary_id" | "ltms";

const categories: Array<[Category, string, number]> = [["license", "Physical driver's license (front & back)", 2], ["secondary_id", "Secondary ID", 1], ["ltms", "LTMS portal photos", 1]];

export default function ProfilePage() {
  const { user, loading, updateUser } = useAuth();
  const signOut = useSignOut();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [form, setForm] = useState({ first_name: "", middle_name: "", last_name: "", date_of_birth: "", username: "" });
  const [password, setPassword] = useState({ current_password: "", password: "", password_confirmation: "" });
  const [saving, setSaving] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    void Promise.all([api.get<Profile>("/auth/profile"), user.role === "customer" ? api.get<CustomerProfile>("/customer/profile") : Promise.resolve(null)])
      .then(([profileResponse, customerResponse]) => {
        setProfile(profileResponse.data);
        setForm({ first_name: profileResponse.data.first_name ?? "", middle_name: profileResponse.data.middle_name ?? "", last_name: profileResponse.data.last_name ?? "", date_of_birth: profileResponse.data.date_of_birth?.slice(0, 10) ?? "", username: profileResponse.data.username ?? "" });
        setCustomer(customerResponse?.data ?? null);
      })
      .catch(error => showToast(error instanceof Error ? error.message : "Unable to load your profile", "error"))
      .finally(() => setProfileLoading(false));
  }, [user, showToast]);

  if (loading) return null;
  if (!user) return <Navigate to="/admin/login" replace />;

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true);
    try { const result = await api.patch<Profile>("/auth/profile", form); setProfile(result.data); updateUser(result.data); showToast("Profile updated.", "success"); }
    catch (error) { showToast(error instanceof Error ? error.message : "Unable to update profile", "error"); }
    finally { setSaving(false); }
  };
  const changePassword = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true);
    try { await api.post("/auth/password", password); setPassword({ current_password: "", password: "", password_confirmation: "" }); showToast("Password changed successfully.", "success"); }
    catch (error) { showToast(error instanceof Error ? error.message : "Unable to change password", "error"); }
    finally { setSaving(false); }
  };
  const upload = async (category: Category, selected: FileList | null, limit: number) => {
    if (!customer || !selected?.length) return;
    const existing = customer.attachments?.filter(item => item.category === category).length ?? 0;
    const payload = new FormData(); payload.append("_method", "PATCH"); payload.append("name", customer.name); payload.append("phone", customer.phone ?? ""); if (customer.email) payload.append("email", customer.email);
    Array.from(selected).slice(0, Math.max(0, limit - existing)).forEach((file, index) => { payload.append(`attachments[${index}][category]`, category); payload.append(`attachments[${index}][file]`, file); });
    try { const result = await api.post<CustomerProfile>(`/customers/${customer.id}`, payload); setCustomer(result.data); showToast("Requirement uploaded.", "success"); }
    catch (error) { showToast(error instanceof Error ? error.message : "Unable to upload requirement", "error"); }
  };
  const removeAttachment = async (attachment: CustomerAttachment) => {
    if (!customer) return;
    try { await api.delete(`/customers/${customer.id}/attachments/${attachment.id}`); setCustomer(current => current ? { ...current, attachments: current.attachments?.filter(item => item.id !== attachment.id) } : current); showToast("Requirement removed.", "success"); }
    catch (error) { showToast(error instanceof Error ? error.message : "Unable to remove requirement", "error"); }
  };
  const input = "mt-2 w-full border border-black/10 px-3 py-3";
  const loadingContent = <div className="mx-auto max-w-4xl" role="status" aria-live="polite"><div className="mb-8"><Skeleton className="h-3 w-20" /><Skeleton className="mt-3 h-9 w-64" /><Skeleton className="mt-3 h-4 w-80 max-w-full" /></div><section className="border border-black/10 bg-white p-5 sm:p-8"><Skeleton className="h-7 w-48" /><div className="mt-5 grid gap-5 sm:grid-cols-2">{[1, 2, 3, 4, 5, 6].map(field => <div key={field}><Skeleton className="h-4 w-24" /><Skeleton className="mt-2 h-12 w-full" /></div>)}</div><Skeleton className="mt-6 h-11 w-32" /></section><section className="mt-6 border border-black/10 bg-white p-5 sm:p-8"><Skeleton className="h-7 w-44" /><Skeleton className="mt-3 h-4 w-72 max-w-full" /><div className="mt-5 grid gap-5 sm:grid-cols-3">{[1, 2, 3].map(field => <div key={field}><Skeleton className="h-4 w-32" /><Skeleton className="mt-2 h-12 w-full" /></div>)}</div></section></div>;
  const content = <div className="mx-auto max-w-4xl"><div className="mb-8"><p className="text-xs uppercase tracking-widest text-[#ff641f]">Account</p><h1 className="mt-2 font-['Space_Grotesk'] text-3xl font-semibold">Profile settings</h1><p className="mt-2 text-sm text-[#777]">Manage your personal information and account security.</p></div>
    <form onSubmit={saveProfile} className="border border-black/10 bg-white p-5 sm:p-8"><h2 className="text-xl font-semibold">Personal information</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm">First name<input required className={input} value={form.first_name} onChange={event => setForm(current => ({ ...current, first_name: event.target.value }))} /></label><label className="text-sm">Middle name <span className="text-[#999]">(optional)</span><input className={input} value={form.middle_name} onChange={event => setForm(current => ({ ...current, middle_name: event.target.value }))} /></label><label className="text-sm">Last name<input required className={input} value={form.last_name} onChange={event => setForm(current => ({ ...current, last_name: event.target.value }))} /></label><label className="text-sm">Date of birth<input type="date" className={input} value={form.date_of_birth} onChange={event => setForm(current => ({ ...current, date_of_birth: event.target.value }))} /></label><label className="text-sm">Username<input required className={input} value={form.username} onChange={event => setForm(current => ({ ...current, username: event.target.value }))} /></label><label className="text-sm">Email address<input disabled className={`${input} bg-black/5`} value={profile?.email ?? user.email} /></label></div><button disabled={saving} className="mt-6 bg-[#ff641f] px-5 py-3 text-sm font-bold text-white disabled:opacity-50">Save profile</button></form>
    <form onSubmit={changePassword} className="mt-6 border border-black/10 bg-white p-5 sm:p-8"><div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">Change password</h2><p className="mt-1 text-sm text-[#777]">Email verification is required before changing your password.</p></div>{profile?.email_verified_at ? <span className="text-xs font-semibold text-emerald-700">Email verified</span> : <button type="button" className="text-xs font-semibold text-[#ff641f]" onClick={async () => { try { await api.post("/auth/email-verification"); showToast("Verification email sent.", "success"); } catch (error) { showToast(error instanceof Error ? error.message : "Unable to send verification email", "error"); } }}>Send verification email</button>}</div><div className="mt-5 grid gap-4 sm:grid-cols-3"><label className="text-sm">Current password<input required type="password" className={input} value={password.current_password} onChange={event => setPassword(current => ({ ...current, current_password: event.target.value }))} /></label><label className="text-sm">New password<input required type="password" className={input} value={password.password} onChange={event => setPassword(current => ({ ...current, password: event.target.value }))} /></label><label className="text-sm">Confirm new password<input required type="password" className={input} value={password.password_confirmation} onChange={event => setPassword(current => ({ ...current, password_confirmation: event.target.value }))} /></label></div><button disabled={saving || !profile?.email_verified_at} className="mt-6 border border-black/10 px-5 py-3 text-sm font-bold disabled:opacity-50">Change password</button></form>
    {customer && <section className="mt-6 border border-black/10 bg-white p-5 sm:p-8"><h2 className="text-xl font-semibold">Booking requirements</h2><p className="mt-1 text-sm text-[#777]">Upload these once and they will be reused for future booking requests.</p>{categories.map(([category, label, limit]) => { const existing = customer.attachments?.filter(item => item.category === category) ?? []; return <div className="mt-5 border-t border-black/10 pt-5" key={category}><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold">{label}</p><span className="text-xs text-[#777]">{existing.length}/{limit} provided</span></div><input className={`${input} text-xs`} type="file" accept="image/*" multiple={limit > 1} onChange={event => { void upload(category, event.target.files, limit); event.currentTarget.value = ""; }} />{existing.length > 0 && <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{existing.map(attachment => <div className="relative overflow-hidden border border-black/10" key={attachment.id}><img src={attachment.url} alt={label} className="h-28 w-full object-cover" /><button type="button" className="absolute right-1 top-1 rounded bg-black/70 px-2 py-1 text-xs text-white" onClick={() => void removeAttachment(attachment)}>Remove</button></div>)}</div>}</div>})}</section>}
  </div>;
  const renderedContent = profileLoading ? loadingContent : content;
  if (user.role !== "customer") return <AdminShell title="Profile settings">{renderedContent}</AdminShell>;
  return <div className="min-h-screen bg-[#f4f3f0] text-[#151515]"><header className="border-b border-black/10 bg-[#111] px-5 text-white sm:px-8"><div className="mx-auto flex h-20 max-w-6xl items-center justify-between"><Link to="/" aria-label="CLCarHub home"><img src="/clcarhublogo_upscaled.png" alt="CLCarHub" className="h-16 w-28 object-contain object-left" /></Link><div className="flex items-center gap-4 text-sm"><span className="hidden sm:block">{displayName(user)}</span><Link className="text-[#ffb18e] hover:text-white" to="/account">Dashboard</Link><button className="text-[#ffb18e] hover:text-white" onClick={signOut}>Sign out</button></div></div></header><main className="px-5 py-10 sm:px-10">{renderedContent}</main></div>;
}
