import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AdminShell } from "../components/AdminShell";
import { DateTimePicker } from "../components/DateTimePicker";
import { ImageLightbox, RowActions, useToast } from "../components/Ui";
import api from "../lib/api";
import type { BookingRecord, CustomerAttachment, Paginated } from "../types";

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });

type Customer = {
  id: number;
  name: string;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  date_of_birth?: string | null;
  license_number?: string | null;
  license_expiry?: string | null;
  identification_information?: string | null;
  notes?: string | null;
  bookings_count?: number;
  outstanding_balance?: number;
  attachments?: CustomerAttachment[];
  bookings?: BookingRecord[];
  user?: { last_login_ip?: string | null };
  ip_block_scopes?: string[];
  archived_at?: string | null;
};
type CustomerSummary = {
  total_customers: number;
  top_customer: { id: number; name: string; bookings_count: number } | null;
  total_receivable: number;
};

type AttachmentCategory =
  | "license"
  | "ltms"
  | "proof_of_billing"
  | "secondary_id"
  | "selfie_license";
type CustomerForm = Omit<Customer, "id" | "bookings_count" | "outstanding_balance" | "bookings" | "attachments" | "user" | "ip_block_scopes"> & {
  attachments: Record<AttachmentCategory, File[]>;
};
const emptyAttachments = (): Record<AttachmentCategory, File[]> => ({
  license: [],
  ltms: [],
  proof_of_billing: [],
  secondary_id: [],
  selfie_license: [],
});
const emptyForm: CustomerForm = {
  name: "",
  first_name: "",
  middle_name: "",
  last_name: "",
  email: "",
  phone: "",
  address: "",
  date_of_birth: "",
  license_number: "",
  license_expiry: "",
  identification_information: "",
  notes: "",
  attachments: emptyAttachments(),
};
const attachmentFields: Array<[AttachmentCategory, string, number]> = [
  ["license", "Physical driver's license (front & back)", 2],
  ["ltms", "LTMS portal screenshots", 4],
  ["proof_of_billing", "Proof of billing & address", 5],
  ["secondary_id", "Secondary ID", 2],
  ["selfie_license", "Selfie with driver's license (optional)", 1],
];

export default function CustomersPage() {
  const { showToast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [summary, setSummary] = useState<CustomerSummary>({ total_customers: 0, top_customer: null, total_receivable: 0 });
  const [profile, setProfile] = useState<Customer | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<BookingRecord | null>(null);

  const loadCustomers = useCallback(() => {
    setLoading(true);
    api
      .get<Paginated<Customer>>(
        `/customers?per_page=100${showArchived ? "&include_archived=1" : ""}${search ? `&search=${encodeURIComponent(search)}` : ""}`,
      )
      .then((result) => setCustomers(result.data.data))
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Unable to load customers"),
      )
      .finally(() => setLoading(false));
  }, [search, showArchived]);

  useEffect(() => {
    const timer = window.setTimeout(loadCustomers, 250);
    return () => window.clearTimeout(timer);
  }, [loadCustomers]);

  useEffect(() => {
    api.get<CustomerSummary>("/customers/summary")
      .then(result => setSummary(result.data))
      .catch(e => setError(e instanceof Error ? e.message : "Unable to load customer summary"));
  }, []);

  const openProfile = async (customer: Customer) => {
    setProfileLoading(true);
    setProfile(customer);
    try {
      const result = await api.get<Customer>(`/customers/${customer.id}?include_archived=1`);
      setProfile(result.data);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Unable to load customer profile", "error");
      setProfile(null);
    } finally {
      setProfileLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };
  const openEdit = (customer: Customer) => {
    setEditing(customer.id);
    setForm({
      name: customer.name,
      first_name: customer.first_name ?? "",
      middle_name: customer.middle_name ?? "",
      last_name: customer.last_name ?? "",
      email: customer.email ?? "",
      phone: customer.phone ?? "",
      address: customer.address ?? "",
      date_of_birth: customer.date_of_birth?.slice(0, 10) ?? "",
      license_number: customer.license_number ?? "",
      license_expiry: customer.license_expiry?.slice(0, 10) ?? "",
      identification_information: customer.identification_information ?? "",
      notes: customer.notes ?? "",
      attachments: emptyAttachments(),
    });
    setShowForm(true);
  };
  const setField = (key: keyof CustomerForm, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const compositeName = (value: CustomerForm) =>
    [value.first_name, value.middle_name, value.last_name].filter((part) => part?.trim()).join(" ") || value.name;
  const setAttachments = (
    category: AttachmentCategory,
    files: FileList | null,
    limit: number,
  ) => {
    if (!files) return;
    const existingCount = editing
      ? (customers
          .find((customer) => customer.id === editing)
          ?.attachments?.filter(
            (attachment) => attachment.category === category,
          ).length ?? 0)
      : 0;
    setForm((current) => ({
      ...current,
      attachments: {
        ...current.attachments,
        [category]: Array.from(files).slice(
          0,
          Math.max(0, limit - existingCount),
        ),
      },
    }));
  };

  const saveCustomer = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const payload = new FormData();
      payload.append("name", compositeName(form));
      Object.entries(form).forEach(([key, value]) => {
        if (key !== "attachments" && key !== "name" && value != null)
          payload.append(key, String(value));
      });
      let attachmentIndex = 0;
      Object.entries(form.attachments).forEach(([category, files]) =>
        files.forEach((file) => {
          payload.append(`attachments[${attachmentIndex}][category]`, category);
          payload.append(`attachments[${attachmentIndex}][file]`, file);
          attachmentIndex += 1;
        }),
      );
      if (editing) {
        payload.append("_method", "PATCH");
        await api.post(`/customers/${editing}`, payload);
      } else await api.post("/customers", payload);
      setShowForm(false);
      loadCustomers();
      showToast(
        editing
          ? "Customer updated successfully."
          : "Customer created successfully.",
        "success",
      );
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "Unable to save customer",
        "error",
      );
    }
  };

  const archiveCustomer = async (customer: Customer) => {
    if (!window.confirm(`Archive ${customer.name}? Their bookings and history will be kept.`))
      return;
    try {
      await api.delete(`/customers/${customer.id}`);
      loadCustomers();
      showToast("Customer archived. Their history was kept.", "success");
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "Unable to archive customer",
        "error",
      );
    }
  };
  const restoreCustomer = async (customer: Customer) => {
    try {
      await api.post(`/customers/${customer.id}/restore`);
      loadCustomers();
      showToast("Customer restored.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Unable to restore customer", "error");
    }
  };
  const removeAttachment = async (customerId: number, attachmentId: number) => {
    try {
      await api.delete(`/customers/${customerId}/attachments/${attachmentId}`);
      setCustomers((current) =>
        current.map((customer) =>
          customer.id === customerId
            ? {
                ...customer,
                attachments: customer.attachments?.filter(
                  (attachment) => attachment.id !== attachmentId,
                ),
              }
            : customer,
        ),
      );
      showToast("Attachment removed.", "success");
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "Unable to remove attachment",
        "error",
      );
    }
  };

  const blockCustomerIp = async (customer: Customer) => {
    const ip = customer.user?.last_login_ip;
    if (!ip) {
      showToast("This customer has no recorded login IP address.", "error");
      return;
    }
    const allAccess = window.confirm(`Block ${ip} from all website/API access?\n\nChoose Cancel to block booking submissions only.`);
    const deleteBookings = window.confirm("Also delete this customer's pending, rejected, and cancelled bookings? This cannot be undone.");
    try {
      await api.post(`/customers/${customer.id}/ip-block`, {
        scope: allAccess ? "all" : "bookings",
        delete_bookings: deleteBookings,
        reason: "Staff action from customer management",
      });
      loadCustomers();
      if (profile?.id === customer.id) void openProfile(customer);
      showToast(`IP ${ip} blocked.`, "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Unable to block customer IP", "error");
    }
  };

  const unblockCustomerIp = async (customer: Customer) => {
    if (!window.confirm(`Unblock ${customer.user?.last_login_ip ?? "this customer's IP"}?`)) return;
    try {
      await api.delete(`/customers/${customer.id}/ip-block`);
      loadCustomers();
      if (profile?.id === customer.id) void openProfile(customer);
      showToast("Customer IP unblocked.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Unable to unblock customer IP", "error");
    }
  };

  const customerActions = (customer: Customer) => [
    { label: "View Profile", onClick: () => void openProfile(customer) },
    { label: "Edit", onClick: () => openEdit(customer) },
    ...(customer.ip_block_scopes?.length
      ? [{ label: "Unblock IP", onClick: () => void unblockCustomerIp(customer) }]
      : [{ label: "Block last IP", danger: true, onClick: () => void blockCustomerIp(customer) }]),
    customer.archived_at
      ? { label: "Restore", onClick: () => void restoreCustomer(customer) }
      : { label: "Archive", danger: true, onClick: () => void archiveCustomer(customer) },
  ];

  type CustomerTextField = Exclude<keyof CustomerForm, "attachments">;
  const fields: Array<[CustomerTextField, string, string]> = [
    ["first_name", "First name", "text"],
    ["middle_name", "Middle name (optional)", "text"],
    ["last_name", "Last name", "text"],
    ["email", "Email (optional)", "email"],
    ["phone", "Phone (optional)", "text"],
    ["date_of_birth", "Date of birth", "date"],
    ["license_number", "License number", "text"],
    ["license_expiry", "License expiry", "date"],
  ];

  return (
    <AdminShell title="Customer management">
      <div className="mt-8 border border-black/10 bg-white p-4 md:p-6">
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <section className="border border-black/10 bg-[#f8f7f5] p-5">
            <p className="text-xs uppercase tracking-widest text-[#777]">Total customers</p>
            <p className="mt-2 text-3xl font-semibold">{summary.total_customers.toLocaleString()}</p>
            <p className="mt-1 text-xs text-[#777]">Registered in the system</p>
          </section>
          <section className="border border-black/10 bg-[#f8f7f5] p-5">
            <p className="text-xs uppercase tracking-widest text-[#777]">Top customer</p>
            <p className="mt-2 truncate text-xl font-semibold">{summary.top_customer?.name ?? "—"}</p>
            <p className="mt-1 text-xs text-[#777]">{summary.top_customer ? `${summary.top_customer.bookings_count} booking${summary.top_customer.bookings_count === 1 ? "" : "s"}` : "No bookings yet"}</p>
          </section>
          <section className="border border-black/10 bg-[#f8f7f5] p-5">
            <p className="text-xs uppercase tracking-widest text-[#777]">Total receivable</p>
            <p className="mt-2 text-3xl font-semibold text-[#ff641f]">{money.format(summary.total_receivable)}</p>
            <p className="mt-1 text-xs text-[#777]">Outstanding customer balances</p>
          </section>
        </div>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-[#777]">
              Manage customer profiles and rental records.
            </p>
            <input
              className="mt-3 w-full border border-black/10 bg-[#f8f7f5] px-3 py-2 text-sm md:w-80"
              placeholder="Search customers..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <label className="mt-3 flex items-center gap-2 text-xs text-[#777]">
              <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
              Show archived customers
            </label>
          </div>
          <button
            className="bg-[#ff641f] px-5 py-3 text-sm font-bold text-white"
            onClick={openCreate}
          >
            + Add customer
          </button>
        </div>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4">
            <form
              className="max-h-[85vh] w-full max-w-3xl overflow-y-auto bg-white p-6 shadow-2xl"
              onSubmit={saveCustomer}
            >
              <div className="flex items-center justify-between">
                <h2 className="font-['Space_Grotesk'] text-2xl font-semibold">
                  {editing ? "Edit customer" : "Add customer"}
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
                {fields.map(([key, label, type]) => (
                  <label className="text-xs text-[#777]" key={key}>
                    {label}
                    {type === "date" ? (
                      <DateTimePicker value={String(form[key] ?? "")} onChange={value => setField(key, value)} className="mt-2 w-full border border-black/10 px-3 py-2.5 text-sm" />
                    ) : (
                      <input
                        className="mt-2 w-full border border-black/10 px-3 py-2.5 text-sm"
                        type={type}
                        required={key === "first_name" || key === "last_name"}
                        value={form[key] ?? ""}
                        onChange={(event) => setField(key, event.target.value)}
                      />
                    )}
                  </label>
                ))}
                <label className="text-xs text-[#777] md:col-span-2">
                  Address (optional)
                  <textarea
                    className="mt-2 w-full border border-black/10 px-3 py-2.5 text-sm"
                    value={form.address ?? ""}
                    onChange={(event) =>
                      setField("address", event.target.value)
                    }
                  />
                </label>
                <label className="text-xs text-[#777] md:col-span-2">
                  Identification information
                  <textarea
                    className="mt-2 w-full border border-black/10 px-3 py-2.5 text-sm"
                    value={form.identification_information ?? ""}
                    onChange={(event) =>
                      setField("identification_information", event.target.value)
                    }
                  />
                </label>
                <label className="text-xs text-[#777] md:col-span-2">
                  Notes
                  <textarea
                    className="mt-2 w-full border border-black/10 px-3 py-2.5 text-sm"
                    value={form.notes ?? ""}
                    onChange={(event) => setField("notes", event.target.value)}
                  />
                </label>
                {attachmentFields.map(([category, label, limit]) => {
                  const existing = editing
                    ? (customers
                        .find((customer) => customer.id === editing)
                        ?.attachments?.filter(
                          (attachment) => attachment.category === category,
                        ) ?? [])
                    : [];
                  return (
                    <label
                      className="text-xs text-[#777] md:col-span-2"
                      key={category}
                    >
                      {label}{" "}
                      <span className="text-[#999]">({limit} images max)</span>
                      <input
                        className="mt-2 w-full border border-dashed border-black/20 px-3 py-3 text-sm"
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(event) =>
                          setAttachments(category, event.target.files, limit)
                        }
                      />
                      {(existing.length > 0 ||
                        form.attachments[category].length > 0) && (
                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {existing.map((attachment) => (
                            <div key={attachment.id}>
                              <ImageLightbox
                                src={attachment.url}
                                alt={label}
                                onRemove={() =>
                                  void removeAttachment(editing!, attachment.id)
                                }
                              />
                            </div>
                          ))}
                          {form.attachments[category].map((file) => (
                            <div key={`${file.name}-${file.lastModified}`}>
                              <ImageLightbox
                                src={URL.createObjectURL(file)}
                                alt={file.name}
                                onRemove={() =>
                                  setForm((current) => ({
                                    ...current,
                                    attachments: {
                                      ...current.attachments,
                                      [category]: current.attachments[
                                        category
                                      ].filter((item) => item !== file),
                                    },
                                  }))
                                }
                              />
                              <p className="truncate px-2 py-1 text-[10px]">
                                {file.name}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </label>
                  );
                })}
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
                  Save customer
                </button>
              </div>
            </form>
          </div>
        )}
        <div className="mt-6 sm:hidden">
          {loading ? (
            <p className="py-8 text-sm text-[#888]">Loading customers...</p>
          ) : customers.length === 0 ? (
            <p className="py-8 text-sm text-[#888]">No customers found.</p>
          ) : (
            <div className="space-y-3">
              {customers.map((customer) => (
                <article className="rounded border border-black/[.06] p-4" key={customer.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words font-semibold">{customer.name}{customer.archived_at && <span className="ml-2 text-xs font-normal text-[#999]">(Archived)</span>}</h3>
                      <p className="mt-1 break-words text-sm text-[#777]">{customer.email || "—"}</p>
                      <p className="break-words text-sm text-[#777]">{customer.phone || "—"}</p>
                    </div>
                    <div className="shrink-0 text-right text-xs"><p className="text-[#777]">{customer.bookings_count ?? 0} bookings</p><p className="mt-1 font-semibold text-amber-600">{money.format(customer.outstanding_balance ?? 0)} due</p></div>
                  </div>
                  <p className="mt-3 break-words text-sm text-[#777]">
                    License: {customer.license_number || "—"}
                    {customer.license_expiry && ` · Expires ${new Date(customer.license_expiry).toLocaleDateString()}`}
                  </p>
                  <div className="mt-4 flex justify-end text-sm"><RowActions actions={customerActions(customer)} /></div>
                </article>
              ))}
            </div>
          )}
        </div>
        <div className="mt-6 hidden overflow-x-auto sm:block">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-black/10 text-[10px] uppercase tracking-widest text-[#888]">
              <tr>
                <th className="pb-3">Name</th>
                <th className="pb-3">Contact</th>
                <th className="pb-3">License</th>
                <th className="pb-3">Bookings</th>
                <th className="pb-3">Outstanding</th>
                <th className="pb-3" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-[#888]">
                    Loading customers...
                  </td>
                </tr>
              ) : (
                customers.map((customer) => (
                  <tr className="border-b border-black/[.06]" key={customer.id}>
                    <td className="py-4 font-semibold">{customer.name}{customer.archived_at && <span className="ml-2 text-xs font-normal text-[#999]">(Archived)</span>}</td>
                    <td className="py-4 text-[#777]">
                      {customer.email || "—"}
                      <br />
                      {customer.phone || "—"}
                    </td>
                    <td className="py-4 text-[#777]">
                      {customer.license_number || "—"}
                      {customer.license_expiry && (
                        <>
                          <br />
                          Expires{" "}
                          {new Date(
                            customer.license_expiry,
                          ).toLocaleDateString()}
                        </>
                      )}
                    </td>
                    <td className="py-4">{customer.bookings_count ?? 0}</td>
                    <td className="py-4 font-semibold text-amber-600">{money.format(customer.outstanding_balance ?? 0)}</td>
                    <td className="py-4 text-right"><RowActions actions={customerActions(customer)} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {profile && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/50 p-4">
            <section className="max-h-[90vh] w-full max-w-4xl overflow-y-auto bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b border-black/10 pb-5">
                <div>
                  <p className="text-xs uppercase tracking-widest text-[#ff641f]">Customer profile</p>
                  <h2 className="mt-2 text-2xl font-semibold">{profile.name}</h2>
                  <p className="mt-1 text-sm text-[#777]">{profile.email || "No email"} · {profile.phone || "No phone"}</p>
                  <p className="mt-1 text-xs text-[#777]">Last login IP: {profile.user?.last_login_ip || "Not recorded"}{profile.ip_block_scopes?.length ? ` · Blocked: ${profile.ip_block_scopes.join(", ")}` : ""}</p>
                </div>
                <button type="button" className="text-2xl text-[#777]" onClick={() => setProfile(null)}>×</button>
              </div>
              {profileLoading ? <div className="flex min-h-48 items-center justify-center text-sm text-[#777]">Loading profile...</div> : <>
                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                  <div><p className="text-xs uppercase text-[#888]">Address</p><p className="mt-1 text-sm">{profile.address || "—"}</p></div>
                  <div><p className="text-xs uppercase text-[#888]">License</p><p className="mt-1 text-sm">{profile.license_number || "—"}</p></div>
                  <div><p className="text-xs uppercase text-[#888]">Outstanding</p><p className="mt-1 font-semibold text-amber-600">{money.format(profile.outstanding_balance ?? profile.bookings?.reduce((sum, booking) => sum + (["cancelled", "rejected"].includes(booking.status) ? 0 : Number(booking.balance ?? 0)), 0) ?? 0)}</p></div>
                </div>
                <div className="mt-8">
                  <h3 className="font-semibold">Booking history</h3>
                  {profile.bookings?.length ? <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-black/10 text-xs uppercase text-[#888]"><tr><th className="py-3 pr-4">Reference</th><th className="py-3 pr-4">Vehicle</th><th className="py-3 pr-4">Pickup</th><th className="py-3 pr-4">Status</th><th className="py-3 text-right">Balance</th></tr></thead><tbody>{profile.bookings.map(booking => <tr className="cursor-pointer border-b border-black/[.06] hover:bg-[#fff7f3]" key={booking.id} tabIndex={0} onClick={() => setSelectedBooking(booking)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedBooking(booking); } }}><td className="py-3 pr-4 font-semibold">{booking.reference}</td><td className="py-3 pr-4">{booking.vehicle?.name || `${booking.vehicle?.brand ?? ""} ${booking.vehicle?.model ?? ""}` || "—"}</td><td className="py-3 pr-4 text-[#777]">{new Date(booking.pickup_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</td><td className="py-3 pr-4 capitalize">{booking.status.replaceAll("_", " ")}</td><td className="py-3 text-right font-semibold">{money.format(Number(booking.balance ?? 0))}</td></tr>)}</tbody></table></div> : <p className="mt-3 text-sm text-[#777]">No booking history.</p>}
                </div>
                <div className="mt-8">
                  <h3 className="font-semibold">Submitted requirements</h3>
                  {profile.attachments?.length ? <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{profile.attachments.map(attachment => <ImageLightbox key={attachment.id} src={attachment.url} alt={attachment.category.replaceAll("_", " ")} />)}</div> : <p className="mt-3 text-sm text-[#777]">No requirements submitted.</p>}
                </div>
              </>}
            </section>
          </div>
        )}
        {selectedBooking && profile && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-black/60 p-4">
            <section className="max-h-[90vh] w-full max-w-3xl overflow-y-auto bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b border-black/10 pb-5">
                <div><p className="text-xs uppercase tracking-widest text-[#ff641f]">Booking details</p><h2 className="mt-2 text-2xl font-semibold">{selectedBooking.reference}</h2><p className="mt-1 capitalize text-sm text-[#777]">{selectedBooking.status.replaceAll("_", " ")}</p></div>
                <button type="button" className="text-2xl text-[#777]" onClick={() => setSelectedBooking(null)}>×</button>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div><p className="text-xs uppercase text-[#888]">Vehicle</p><p className="mt-1 font-semibold">{selectedBooking.vehicle?.name || `${selectedBooking.vehicle?.brand ?? ""} ${selectedBooking.vehicle?.model ?? ""}` || "—"}</p><p className="text-sm text-[#777]">{selectedBooking.vehicle?.plate_number || "—"}</p></div>
                <div><p className="text-xs uppercase text-[#888]">Customer</p><p className="mt-1 font-semibold">{profile.name}</p><p className="text-sm text-[#777]">{profile.email || profile.phone || "—"}</p></div>
                <div><p className="text-xs uppercase text-[#888]">Pickup</p><p className="mt-1 text-sm">{new Date(selectedBooking.pickup_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</p><p className="text-xs text-[#777]">Destination: {selectedBooking.destination || "No destination"}</p>{selectedBooking.payment_method === "cash_on_delivery" && <p className="mt-1 text-xs text-[#777]">Delivery: {selectedBooking.delivery_address || "Location pinned on map"}</p>}</div>
                <div><p className="text-xs uppercase text-[#888]">Return</p><p className="mt-1 text-sm">{new Date(selectedBooking.return_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</p><p className="text-xs text-[#777]">{selectedBooking.return_address || "No return address"}</p></div>
              </div>
              <div className="mt-8 border-t border-black/10 pt-5"><h3 className="font-semibold">Charges</h3><div className="mt-3 grid gap-3 sm:grid-cols-2"><div><p className="text-xs text-[#888]">Rental fees</p><p className="font-semibold">{money.format(Number(selectedBooking.rental_amount ?? 0))}</p></div><div><p className="text-xs text-[#888]">Extension fees</p><p className="font-semibold">{money.format(Number(selectedBooking.extension_fees ?? 0))}</p></div><div><p className="text-xs text-[#888]">Additional charges</p><p className="font-semibold">{money.format(Number(selectedBooking.additional_charges ?? 0))}</p></div>{Number(selectedBooking.delivery_fee ?? 0) > 0 && <div><p className="text-xs text-[#888]">Delivery fee ({money.format(Number(selectedBooking.delivery_rate_per_km ?? 0))} x {Number(selectedBooking.delivery_distance_km ?? 0).toFixed(2)} km)</p><p className="font-semibold">{money.format(Number(selectedBooking.delivery_fee))}</p></div>}<div><p className="text-xs text-[#888]">Security deposit</p><p className="font-semibold">{money.format(Number(selectedBooking.deposit ?? selectedBooking.vehicle?.security_deposit_fee ?? 0))}</p></div><div><p className="text-xs text-[#888]">Total</p><p className="font-semibold">{money.format(Number(selectedBooking.total_amount ?? 0))}</p></div><div><p className="text-xs text-[#888]">Outstanding balance</p><p className="font-semibold text-amber-600">{money.format(Number(selectedBooking.balance ?? 0))}</p></div></div></div>
              <div className="mt-8 border-t border-black/10 pt-5"><h3 className="font-semibold">Submitted requirements</h3>{profile.attachments?.length ? <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{profile.attachments.map(attachment => <ImageLightbox key={attachment.id} src={attachment.url} alt={attachment.category.replaceAll("_", " ")} />)}</div> : <p className="mt-3 text-sm text-[#777]">No requirements submitted.</p>}</div>
            </section>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
