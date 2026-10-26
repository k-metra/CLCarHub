import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AdminShell } from "../components/AdminShell";
import { RowActions, useToast } from "../components/Ui";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { formatPartnerName } from "../lib/partners";
import type { Paginated, PartnerRecord } from "../types";

type PartnerForm = Omit<PartnerRecord, "id" | "vehicles_count" | "host_access_status" | "user">;
type AccountCandidate = { id: number; name: string; email: string; username?: string | null; role: string; status: string };
const emptyForm: PartnerForm = {
  name: "",
  first_name: "",
  middle_name: "",
  last_name: "",
  email: "",
  contact_number: "",
  vehicles_stored_at_garage: false,
  address: "",
  commission_based_on: "base_rent_only",
  commission_type: "percentage",
  commission_value: "",
};

export default function PartnersPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [partners, setPartners] = useState<PartnerRecord[]>([]);
  const [form, setForm] = useState<PartnerForm>(emptyForm);
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [provisioning, setProvisioning] = useState<PartnerRecord | null>(null);
  const [provisionMode, setProvisionMode] = useState<"account" | "invitation">("account");
  const [accountSearch, setAccountSearch] = useState("");
  const [accountCandidates, setAccountCandidates] = useState<AccountCandidate[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [invitationUrl, setInvitationUrl] = useState("");
  const [invitationCopied, setInvitationCopied] = useState(false);
  const [sendingInvitation, setSendingInvitation] = useState(false);
  const [invitationEmailStatus, setInvitationEmailStatus] = useState<"idle" | "sent" | "error">("idle");
  const [invitationEmailError, setInvitationEmailError] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(() => {
    api
      .get<Paginated<PartnerRecord>>("/partners")
      .then((result) => setPartners(result.data.data))
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Unable to load partners"),
      );
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const save = async (event: FormEvent) => {
    event.preventDefault();
    try {
      if (editing)
        await api.put(`/partners/${editing}`, {
          ...form,
          name: undefined,
          commission_value: Number(form.commission_value),
        });
      else
        await api.post("/partners", {
          ...form,
          name: undefined,
          commission_value: Number(form.commission_value),
        });
      setShowForm(false);
      setEditing(null);
      setForm(emptyForm);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save partner");
    }
  };
  const edit = (partner: PartnerRecord) => {
    setEditing(partner.id);
    setForm({
      name: partner.name,
      first_name: partner.first_name ?? "",
      middle_name: partner.middle_name ?? "",
      last_name: partner.last_name ?? "",
      email: partner.email,
      contact_number: partner.contact_number,
      vehicles_stored_at_garage: partner.vehicles_stored_at_garage ?? false,
      address: partner.address,
      commission_based_on: partner.commission_based_on,
      commission_type: partner.commission_type,
      commission_value: partner.commission_value,
    });
    setShowForm(true);
  };
  const remove = async (id: number) => {
    if (
      !window.confirm(
        "Delete this partner? Vehicles will become CL CarHub owned.",
      )
    )
      return;
    try {
      await api.delete(`/partners/${id}`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to delete partner");
    }
  };
  const loadAccountCandidates = async (search: string) => {
    try {
      const response = await api.get<AccountCandidate[]>("/partner-account-candidates", { params: { search } });
      setAccountCandidates(response.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load accounts");
    }
  };
  const openProvisionModal = (partner: PartnerRecord) => {
    setProvisioning(partner);
    setProvisionMode("account");
    setAccountSearch("");
    setSelectedAccountId(null);
    setInvitationUrl("");
    setInvitationCopied(false);
    setInvitationEmailStatus("idle");
    setInvitationEmailError("");
    void loadAccountCandidates("");
  };
  const provision = async (event: FormEvent) => {
    event.preventDefault();
    if (!provisioning) return;
    if (provisionMode === "account" && !selectedAccountId) {
      setError("Select an existing account first.");
      return;
    }
    try {
      const payload = provisionMode === "account"
        ? { user_id: selectedAccountId }
        : { email: provisioning.email, name: provisioning.name };
      const response = await api.post<{ activation_token: string }>(`/partners/${provisioning.id}/provision`, payload);
      setInvitationUrl(`${window.location.origin}/host/activate?token=${encodeURIComponent(response.data.activation_token)}`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to provision host access");
    }
  };
  const copyInvitation = async () => {
    try {
      await navigator.clipboard.writeText(invitationUrl);
      setInvitationCopied(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to copy invitation link");
    }
  };
  const sendInvitation = async () => {
    if (!provisioning) return;
    setSendingInvitation(true);
    setInvitationEmailStatus("idle");
    setInvitationEmailError("");
    try {
      await api.post(`/partners/${provisioning.id}/send-invitation`);
      setError("");
      setSendingInvitation(false);
      setInvitationEmailStatus("sent");
      showToast("The invitation email was sent.", "success");
    } catch (e) {
      setSendingInvitation(false);
      const message = e instanceof Error ? e.message : "Unable to send invitation email";
      setInvitationEmailStatus("error");
      setInvitationEmailError(message);
      showToast(message, "error");
    }
  };
  const resendInvitation = async (partner: PartnerRecord) => {
    try {
      await api.post(`/partners/${partner.id}/send-invitation`);
      showToast(`Invitation resent to ${partner.user?.email ?? partner.email}.`, "success");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unable to resend invitation";
      setError(message);
      showToast(message, "error");
    }
  };
  const cancelInvitation = async (partner: PartnerRecord) => {
    if (!window.confirm(`Cancel the pending host invitation for ${formatPartnerName(partner)}? The current invitation link will stop working.`)) return;
    try {
      await api.post(`/partners/${partner.id}/revoke-access`);
      showToast("Pending host invitation canceled.", "success");
      load();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unable to cancel invitation";
      setError(message);
      showToast(message, "error");
    }
  };
  const reactivate = async (partner: PartnerRecord) => {
    if (!window.confirm(`Reactivate Host Dashboard access for ${formatPartnerName(partner)}?`)) return;
    try {
      await api.post(`/partners/${partner.id}/reactivate-access`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to reactivate host access");
    }
  };
  return (
    <AdminShell title="Partners">
      <div className="mt-8 border border-black/10 bg-white p-4 md:p-6">
        <div className="flex justify-end">
          <button
            className="bg-[#ff641f] px-5 py-3 text-sm font-bold text-white"
            onClick={() => {
              setEditing(null);
              setForm(emptyForm);
              setShowForm(true);
            }}
          >
            + Add partner
          </button>
        </div>
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
            <form
              className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-2xl"
              onSubmit={save}
            >
              <div className="flex items-center justify-between">
                <h2 className="font-['Space_Grotesk'] text-2xl font-semibold">
                  {editing ? "Edit partner" : "Add partner"}
                </h2>
                <button
                  type="button"
                  className="text-2xl text-[#777]"
                  onClick={() => setShowForm(false)}
                >
                  ×
                </button>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {[
                  ["last_name", "Last name"],
                  ["middle_name", "Middle name (Optional)"],
                  ["first_name", "First name"],
                  ["email", "Email"],
                  ["contact_number", "Contact number"],
                  ["address", "Address"],
                ].map(([key, label]) => (
                  <label className="text-xs text-[#777]" key={key}>
                    {label}
                    <input
                      className="mt-2 w-full border border-black/10 px-3 py-2.5 text-sm text-[#151515]"
                      type={key === "email" ? "email" : key === "contact_number" ? "tel" : "text"}
                      placeholder={key === "contact_number" ? "09XXXXXXXXX or +639XXXXXXXXX" : undefined}
                      value={String(form[key as keyof PartnerForm] ?? "")}
                      onChange={(e) =>
                        setForm({ ...form, [key]: e.target.value })
                      }
                      required={key !== "middle_name"}
                    />
                  </label>
                ))}
                <label className="text-xs text-[#777]">
                  Commission based on
                  <select
                    className="mt-2 w-full border border-black/10 px-3 py-2.5 text-sm text-[#151515]"
                    value={form.commission_based_on}
                    onChange={(e) =>
                      setForm({ ...form, commission_based_on: e.target.value })
                    }
                  >
                    <option value="base_rent_only">Base Rent Only</option>
                    <option value="total_booking_amount">
                      Total Booking Amount
                    </option>
                  </select>
                </label>
                <label className="text-xs text-[#777]">
                  Commission type
                  <select
                    className="mt-2 w-full border border-black/10 px-3 py-2.5 text-sm text-[#151515]"
                    value={form.commission_type}
                    onChange={(e) =>
                      setForm({ ...form, commission_type: e.target.value })
                    }
                  >
                    <option value="percentage">Percentage</option>
                    <option value="fixed_amount">Fixed Amount</option>
                  </select>
                </label>
                <label className="text-xs text-[#777] md:col-span-2">
                  Partner share
                  <input
                    className="mt-2 w-full border border-black/10 px-3 py-2.5 text-sm text-[#151515]"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.commission_value}
                    onChange={(e) =>
                      setForm({ ...form, commission_value: e.target.value })
                    }
                    required
                  />
                </label>
                <label className="flex items-start gap-3 border border-black/10 p-4 text-sm text-[#555] md:col-span-2">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={Boolean(form.vehicles_stored_at_garage)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        vehicles_stored_at_garage: e.target.checked,
                      })
                    }
                  />
                  <span>
                    <span className="block font-semibold text-[#151515]">
                      Vehicles stored at CL CarHub garage
                    </span>
                    <span className="mt-1 block text-xs text-[#777]">
                      When enabled, this partner will not receive booking
                      assignment, cancellation, or schedule-update SMS because
                      their vehicles are already stored at the garage. Payout
                      SMS notifications are not affected.
                    </span>
                  </span>
                </label>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  className="border border-black/10 px-4 py-2 text-sm"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
                <button className="bg-[#151515] px-5 py-2 text-sm font-bold text-white">
                  Save partner
                </button>
              </div>
            </form>
          </div>
        )}
        {provisioning && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="provision-host-title">
            <form className="theme-surface max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl" onSubmit={provision}>
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-[10px] font-bold uppercase tracking-[2px] text-[#ff641f]">Host access</p><h2 id="provision-host-title" className="mt-2 font-['Space_Grotesk'] text-2xl font-semibold">Connect {provisioning.name}</h2><p className="mt-2 text-sm text-[#777]">Choose an existing account or create a secure invitation link.</p></div>
                <button type="button" className="text-2xl text-[#777]" aria-label="Close host provisioning dialog" onClick={() => setProvisioning(null)}>×</button>
              </div>
              <div className="mt-6 space-y-3">
                <label className={`flex cursor-pointer gap-3 border p-4 ${provisionMode === "account" ? "border-[#ff641f] bg-[#fff7f3]" : "border-black/10"}`}>
                  <input type="radio" name="provision-mode" checked={provisionMode === "account"} onChange={() => { setProvisionMode("account"); void loadAccountCandidates(accountSearch); }} />
                  <span className="flex-1"><span className="block font-semibold">Link an existing account</span><span className="mt-1 block text-sm text-[#777]">Search eligible accounts without creating a duplicate.</span></span>
                </label>
                {provisionMode === "account" && <div className="ml-7">
                  <input className="w-full border border-black/10 px-3 py-2.5 text-sm" placeholder="Search by name, email, or username" value={accountSearch} onChange={event => { setAccountSearch(event.target.value); void loadAccountCandidates(event.target.value); }} />
                  <div className="mt-2 max-h-44 overflow-y-auto border border-black/10">{accountCandidates.length ? accountCandidates.map(account => <button type="button" className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-black/[.04] ${selectedAccountId === account.id ? "bg-[#fff1e9]" : ""}`} key={account.id} onClick={() => setSelectedAccountId(account.id)}><span><span className="block font-semibold">{account.name}</span><span className="text-xs text-[#777]">{account.email}</span></span><span className="text-xs uppercase text-[#999]">{account.role}</span></button>) : <p className="p-3 text-sm text-[#777]">No unlinked accounts found.</p>}</div>
                </div>}
                <label className={`flex cursor-pointer gap-3 border p-4 ${provisionMode === "invitation" ? "border-[#ff641f] bg-[#fff7f3]" : "border-black/10"}`}>
                  <input type="radio" name="provision-mode" checked={provisionMode === "invitation"} onChange={() => setProvisionMode("invitation")} />
                  <span><span className="block font-semibold">Create an invitation link</span><span className="mt-1 block text-sm text-[#777]">Create a new host login using {provisioning.email}.</span></span>
                </label>
              </div>
              {invitationUrl && <div className="theme-surface mt-5 rounded border border-emerald-200 bg-emerald-50 p-4"><p className="text-sm font-semibold text-emerald-900">Invitation link ready</p><div className="mt-2 flex gap-2"><input className="min-w-0 flex-1 border border-emerald-200 bg-white px-3 py-2 text-xs" value={invitationUrl} readOnly /><button type="button" className="shrink-0 border border-emerald-300 px-3 py-2 text-xs font-bold text-emerald-900" onClick={() => void copyInvitation()} aria-label="Copy invitation link">{invitationCopied ? "Copied" : "Copy link ▣"}</button></div><button type="button" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[#ff641f] disabled:cursor-not-allowed disabled:opacity-50" disabled={sendingInvitation} onClick={() => void sendInvitation()}>{sendingInvitation && <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#ff641f]/30 border-t-[#ff641f]" aria-hidden="true" />}{sendingInvitation ? "Sending invitation…" : invitationEmailStatus === "sent" ? "Send again by email ↗" : "Send invitation by email ↗"}</button>{invitationEmailStatus === "sent" && <p className="mt-2 text-sm font-medium text-emerald-700">Invitation email sent to {provisioning.email}. Ask the partner to check spam or junk folders if it does not arrive.</p>}{invitationEmailStatus === "error" && <p className="mt-2 text-sm font-medium text-red-600">{invitationEmailError}</p>}</div>}
              <div className="mt-6 flex justify-end gap-3"><button type="button" className="border border-black/10 px-4 py-2 text-sm" onClick={() => setProvisioning(null)}>Cancel</button><button className="bg-[#151515] px-5 py-2 text-sm font-bold text-white">{invitationUrl ? "Regenerate link" : "Continue"}</button></div>
            </form>
          </div>
        )}
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-black/10 text-[10px] uppercase tracking-widest text-[#888]">
              <tr>
                <th className="pb-3">Name</th>
                <th className="pb-3">Contact</th>
                <th className="pb-3">Commission basis</th>
                <th className="pb-3">Commission</th>
                <th className="pb-3">Vehicles</th>
                <th className="pb-3">Host access</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {partners.map((partner) => (
                <tr className="border-b border-black/[.06]" key={partner.id}>
                  <td className="py-4">
                    <p className="font-semibold">{formatPartnerName(partner)}</p>
                    <p className="text-xs text-[#777]">{partner.email}</p>
                  </td>
                  <td className="py-4 text-[#777]">{partner.contact_number}</td>
                  <td className="py-4 text-[#777]">
                    {partner.commission_based_on === "base_rent_only"
                      ? "Base Rent Only"
                      : "Total Booking Amount"}
                  </td>
                  <td className="py-4">
                    {partner.commission_type === "percentage"
                      ? `${partner.commission_value}%`
                      : `₱${Number(partner.commission_value).toLocaleString()}`}
                  </td>
                  <td className="py-4">{partner.vehicles_count ?? 0}</td>
                  <td className="py-4 text-xs uppercase tracking-wide text-[#777]">{partner.host_access_status ?? "not_provisioned"}</td>
                  <td className="py-4 text-right"><RowActions actions={[{ label: "Details", onClick: () => navigate(`/admin/partners/${partner.id}`) }, { label: "Edit", onClick: () => edit(partner) }, ...(!partner.user ? [{ label: "Provision host", onClick: () => openProvisionModal(partner) }] : partner.host_access_status === "pending_activation" ? [{ label: "Resend invitation", onClick: () => void resendInvitation(partner) }, { label: "Cancel invitation", danger: true, onClick: () => void cancelInvitation(partner) }] : partner.host_access_status === "revoked" ? [{ label: "Reactivate host", onClick: () => void reactivate(partner) }] : [{ label: "Revoke host", danger: true, onClick: async () => { await api.post(`/partners/${partner.id}/revoke-access`); load(); } }]), { label: "Delete", danger: true, onClick: () => void remove(partner.id) }]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
