import { useEffect, useState, type FormEvent } from "react";
import { AdminShell } from "../components/AdminShell";
import { useToast } from "../components/Ui";
import api from "../lib/api";
import type { FleetSettings } from "../types";

const defaults: FleetSettings = { reservation_fee: "0", reservation_fee_deductible: true, default_hour_extension_rate: "200", full_day_extension_threshold_hours: 12, late_return_grace_period_minutes: 60 };

const normalizeSettings = (value: Partial<FleetSettings>): FleetSettings => ({
  reservation_fee: value.reservation_fee ?? defaults.reservation_fee,
  reservation_fee_deductible: value.reservation_fee_deductible ?? defaults.reservation_fee_deductible,
  default_hour_extension_rate: value.default_hour_extension_rate === undefined ? defaults.default_hour_extension_rate : value.default_hour_extension_rate,
  full_day_extension_threshold_hours: value.full_day_extension_threshold_hours ?? defaults.full_day_extension_threshold_hours,
  late_return_grace_period_minutes: value.late_return_grace_period_minutes ?? defaults.late_return_grace_period_minutes,
});

export default function FleetSettingsPage() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<FleetSettings>("/fleet-settings")
      .then(response => setSettings(normalizeSettings(response.data)))
      .catch(error => showToast(error instanceof Error ? error.message : "Unable to load fleet settings", "error"))
      .finally(() => setLoading(false));
  }, [showToast]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await api.put<FleetSettings>("/fleet-settings", settings);
      setSettings(normalizeSettings(response.data));
      showToast("Fleet settings saved.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to save fleet settings", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminShell title="Fleet Settings">
      <div className="mt-8 max-w-3xl space-y-6">
        <section className="border border-black/10 bg-white p-5 sm:p-8">
          <p className="text-xs uppercase tracking-widest text-[#ff641f]">Reservation policy</p>
          <h2 className="mt-2 text-2xl font-semibold">Global reservation fee</h2>
          <p className="mt-2 text-sm text-[#777]">This fee applies to every vehicle and replaces the old vehicle-specific reservation fee.</p>
          {loading ? (
            <div className="mt-6 space-y-6" role="status" aria-live="polite">
              <div>
                <div className="h-4 w-32 animate-pulse rounded bg-black/10" />
                <div className="mt-2 h-12 w-full animate-pulse rounded bg-black/5" />
              </div>
              <div className="h-20 animate-pulse rounded border border-black/10 bg-black/[.03]" />
              <div className="flex justify-end"><div className="h-11 w-32 animate-pulse rounded bg-black/10" /></div>
              <span className="sr-only">Loading fleet settings...</span>
            </div>
          ) : (
            <form className="mt-6 space-y-6" onSubmit={save}>
              <label className="block text-sm font-semibold">
                Reservation fee
                <div className="relative mt-2">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[#777]">₱</span>
                  <input required min="0" step="0.01" type="number" className="w-full border border-black/10 py-3 pl-8 pr-3 text-sm" value={settings.reservation_fee} onChange={event => setSettings(current => ({ ...current, reservation_fee: event.target.value }))} />
                </div>
              </label>
              <label className="block text-sm font-semibold">
                Default hourly extension rate
                <div className="relative mt-2">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[#777]">₱</span>
                  <input min="0" step="0.01" type="number" className="w-full border border-black/10 py-3 pl-8 pr-3 text-sm" value={settings.default_hour_extension_rate ?? ""} onChange={event => setSettings(current => ({ ...current, default_hour_extension_rate: event.target.value === "" ? null : event.target.value }))} />
                </div>
                <span className="mt-1 block text-xs font-normal text-[#777]">Used when a vehicle does not have its own hourly extension rate. Default: ₱200 per hour.</span>
              </label>
              <label className="block text-sm font-semibold">
                Full-day extension threshold
                <div className="mt-2 flex items-center gap-3">
                  <input required min="1" max="23" type="number" className="w-28 border border-black/10 px-3 py-3 text-sm" value={settings.full_day_extension_threshold_hours} onChange={event => setSettings(current => ({ ...current, full_day_extension_threshold_hours: Number(event.target.value) }))} />
                  <span className="font-normal text-[#555]">hours</span>
                </div>
                <span className="mt-1 block text-xs font-normal text-[#777]">At or above this many extra hours, charge one full daily rate instead.</span>
              </label>
              <label className="block text-sm font-semibold">
                Late return grace period
                <div className="mt-2 flex items-center gap-3">
                  <input required min="0" max="1439" type="number" className="w-28 border border-black/10 px-3 py-3 text-sm" value={settings.late_return_grace_period_minutes} onChange={event => setSettings(current => ({ ...current, late_return_grace_period_minutes: Number(event.target.value) }))} />
                  <span className="font-normal text-[#555]">minutes</span>
                </div>
                <span className="mt-1 block text-xs font-normal text-[#777]">Returns within this period after a full rental day do not incur an hourly extension charge. Default: 60 minutes.</span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 border border-black/10 p-4 text-sm">
                <input type="checkbox" className="mt-1 h-4 w-4 accent-[#ff641f]" checked={settings.reservation_fee_deductible} onChange={event => setSettings(current => ({ ...current, reservation_fee_deductible: event.target.checked }))} />
                <span><strong className="block">Deduct reservation fee from rental total</strong><span className="mt-1 block text-[#777]">When enabled, the reservation fee counts as an advance payment toward the rental total. When disabled, it is added as a separate charge.</span></span>
              </label>
              <div className="flex justify-end">
                <button disabled={saving} className="bg-[#ff641f] px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? "Saving..." : "Save settings"}</button>
              </div>
            </form>
          )}
        </section>
        <section className="border border-dashed border-black/20 p-5 text-sm text-[#777]">
          <p className="font-semibold text-[#151515]">Future fleet settings</p>
          <p className="mt-2">Default security deposit, minimum rental duration, booking buffers, customer cancellation rules, and maintenance scheduling can be added here as the fleet policy grows.</p>
        </section>
      </div>
    </AdminShell>
  );
}
