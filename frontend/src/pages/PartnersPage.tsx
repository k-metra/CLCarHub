import { useCallback, useEffect, useState, type FormEvent } from "react";
import { AdminShell } from "../components/AdminShell";
import { RowActions } from "../components/Ui";
import api from "../lib/api";
import type { Paginated, PartnerRecord } from "../types";

type PartnerForm = Omit<PartnerRecord, "id" | "vehicles_count">;
const emptyForm: PartnerForm = {
  name: "",
  email: "",
  contact_number: "",
  address: "",
  commission_based_on: "base_rent_only",
  commission_type: "percentage",
  commission_value: "",
};

export default function PartnersPage() {
  const [partners, setPartners] = useState<PartnerRecord[]>([]);
  const [form, setForm] = useState<PartnerForm>(emptyForm);
  const [editing, setEditing] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
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
          commission_value: Number(form.commission_value),
        });
      else
        await api.post("/partners", {
          ...form,
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
      email: partner.email,
      contact_number: partner.contact_number,
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <form
              className="w-full max-w-2xl bg-white p-6 shadow-2xl"
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
                  ["name", "Name"],
                  ["email", "Email"],
                  ["contact_number", "Contact number"],
                  ["address", "Address"],
                ].map(([key, label]) => (
                  <label className="text-xs text-[#777]" key={key}>
                    {label}
                    <input
                      className="mt-2 w-full border border-black/10 px-3 py-2.5 text-sm text-[#151515]"
                      type={key === "email" ? "email" : "text"}
                      value={form[key as keyof PartnerForm]}
                      onChange={(e) =>
                        setForm({ ...form, [key]: e.target.value })
                      }
                      required
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
                  Commission value
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
                <th />
              </tr>
            </thead>
            <tbody>
              {partners.map((partner) => (
                <tr className="border-b border-black/[.06]" key={partner.id}>
                  <td className="py-4">
                    <p className="font-semibold">{partner.name}</p>
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
                  <td className="py-4 text-right"><RowActions actions={[{ label: "Edit", onClick: () => edit(partner) }, { label: "Delete", danger: true, onClick: () => void remove(partner.id) }]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
