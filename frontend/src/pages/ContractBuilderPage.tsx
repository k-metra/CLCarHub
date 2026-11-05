import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import SignaturePadEngine from "signature_pad";
import { AdminShell } from "../components/AdminShell";
import { useToast } from "../components/Ui";
import api from "../lib/api";
import type { BookingRecord, FleetSettings, Paginated } from "../types";

export type ContractOptions = {
  strict_destination: boolean;
  release_of_liability: boolean;
  no_smoking: boolean;
  easytrip_before?: string;
  easytrip_after?: string;
  autosweep_before?: string;
  autosweep_after?: string;
  fuel_before?: string;
  fuel_after?: string;
};
export type Contract = { id: number; booking_id: number; status: string; special_terms?: string | null; options?: Partial<ContractOptions> | null; signed_at?: string | null; signature_data?: string | null; staff_signature_data?: string | null; booking: BookingRecord };
type PaginatedBookings = Paginated<BookingRecord> & { current_page: number; last_page: number };
const defaultContractOptions: ContractOptions = { strict_destination: false, release_of_liability: false, no_smoking: false, easytrip_before: "", easytrip_after: "", autosweep_before: "", autosweep_after: "", fuel_before: "", fuel_after: "" };
const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const dateTime = (value?: string) => value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—";
const vehicleLabel = (booking: BookingRecord) => booking.vehicle ? `${booking.vehicle.name || `${booking.vehicle.brand} ${booking.vehicle.model}`} · ${booking.vehicle.plate_number}` : "Vehicle";
const apiOrigin = (import.meta.env.VITE_API_URL ?? "http://localhost:8000/api").replace(/\/api\/?$/, "");
const vehicleImage = (booking: BookingRecord) => {
  const value = booking.vehicle?.images?.[0]?.url;
  return value ? (value.startsWith("http") ? value : `${apiOrigin}/storage/${value.replace(/^\/+/, "").replace(/^storage\//, "")}`) : null;
};
const rentalDays = (booking: BookingRecord) => Math.max(1, Math.floor((new Date(booking.return_at).getTime() - new Date(booking.pickup_at).getTime()) / 86400000));
const extensionHours = (booking: BookingRecord) => Math.ceil(((new Date(booking.return_at).getTime() - new Date(booking.pickup_at).getTime()) % 86400000) / 3600000);
const extensionUsesFullDayRate = (booking: BookingRecord, threshold: number) => {
  const remainderMinutes = Math.ceil((new Date(booking.return_at).getTime() - new Date(booking.pickup_at).getTime()) / 60000) % (24 * 60);
  return Boolean(booking.extension_pricing_applied) && remainderMinutes !== 12 * 60 && extensionHours(booking) >= threshold;
};
const rentalAmountLabel = (booking: BookingRecord) => {
  const minutes = Math.ceil((new Date(booking.return_at).getTime() - new Date(booking.pickup_at).getTime()) / 60000);
  if (minutes <= 12 * 60) {
    const dailyRate = Number(booking.rental_rate ?? booking.vehicle?.daily_rate ?? 0);
    return money.format(booking.vehicle?.twelve_hour_rate == null ? dailyRate * 0.5 : Number(booking.vehicle.twelve_hour_rate));
  }
  return money.format(Number(booking.rental_rate ?? booking.vehicle?.daily_rate ?? 0));
};

function BookingCard({ booking, contractStatus, selected, onSelect }: { booking: BookingRecord; contractStatus?: string; selected: boolean; onSelect: () => void }) {
  const image = vehicleImage(booking);
  return <button type="button" onClick={onSelect} className={`w-full rounded border p-3 text-left transition ${selected ? "border-[#ff641f] bg-[#fff7f3] ring-1 ring-[#ff641f]" : "border-black/10 bg-white hover:border-[#ff641f]"}`}>
    <div className="flex items-start gap-3">{image ? <img src={image} alt="" className="h-16 w-20 shrink-0 rounded object-cover" /> : <div className="h-16 w-20 shrink-0 rounded bg-[#f1f1f1]" />}<div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className="font-semibold">{booking.reference}</p><div className="flex shrink-0 flex-col items-end gap-1 text-[10px] uppercase"><span className="booking-status-tag text-[#777]">{booking.status.replace("for_handover", "For handover").replace("for_delivery", "For delivery").replace("for_completion", "For completion")}</span>{contractStatus && <span className="contract-status-tag rounded bg-[#fff0e9] px-1.5 py-0.5 font-bold text-[#d94f12]">Contract {contractStatus}</span>}</div></div><p className="mt-1 truncate text-sm">{booking.customer?.name ?? "Unknown renter"}</p><p className="mt-1 truncate text-xs text-[#777]">{vehicleLabel(booking)}</p></div></div>
    <div className="mt-3 grid gap-2 border-t border-black/10 pt-3 text-xs text-[#555] sm:grid-cols-3"><div><span className="block text-[10px] uppercase text-[#999]">Date booked</span>{dateTime(booking.created_at)}</div><div><span className="block text-[10px] uppercase text-[#999]">Departure</span>{dateTime(booking.pickup_at)}</div><div><span className="block text-[10px] uppercase text-[#999]">Return</span>{dateTime(booking.return_at)}</div></div>
  </button>;
}

function SignaturePad({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePadEngine | null>(null);
  const canvasRatioRef = useRef(1);
  const emittedValueRef = useRef("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pad = new SignaturePadEngine(canvas, {
      minWidth: 0.8,
      maxWidth: 2.8,
      penColor: "#151515",
      velocityFilterWeight: 0.7,
      throttle: 8,
    });
    padRef.current = pad;
    emittedValueRef.current = value;
    const resizeCanvas = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const existingData = pad.isEmpty() ? null : pad.toData();
      const bounds = canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      canvasRatioRef.current = ratio;
      canvas.width = Math.round(bounds.width * ratio);
      canvas.height = Math.round(bounds.height * ratio);
      canvas.getContext("2d")?.scale(ratio, ratio);
      pad.clear();
      if (existingData) pad.fromData(existingData);
    };
    resizeCanvas();
    if (value) void pad.fromDataURL(value, { ratio: canvasRatioRef.current, width: canvas.clientWidth, height: canvas.clientHeight });
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(canvas);
    pad.addEventListener("endStroke", () => {
      const nextValue = pad.toDataURL("image/png");
      emittedValueRef.current = nextValue;
      onChange(nextValue);
    });
    return () => {
      pad.off();
      resizeObserver.disconnect();
      padRef.current = null;
    };
  }, [onChange]);

  useEffect(() => {
    const pad = padRef.current;
    const canvas = canvasRef.current;
    if (!pad || !canvas || value === emittedValueRef.current) return;
    pad.clear();
    emittedValueRef.current = value;
    if (value) void pad.fromDataURL(value, { ratio: canvasRatioRef.current, width: canvas.clientWidth, height: canvas.clientHeight });
  }, [value]);

  const clear = () => {
    padRef.current?.clear();
    emittedValueRef.current = "";
    onChange("");
  };

  return <div className="mt-2">
    <div className="overflow-hidden rounded border border-black/15 bg-white">
      <canvas ref={canvasRef} aria-label="Draw your signature" className="block h-36 w-full touch-none cursor-crosshair" />
    </div>
    <div className="mt-2 flex items-center justify-between gap-3">
      <p className="text-[11px] text-[#777]">Use your mouse, trackpad, or finger to sign.</p>
      <button type="button" className="text-xs font-semibold text-[#d94f12] hover:underline" onClick={clear}>Clear signature</button>
    </div>
  </div>;
}

export function ContractPreview({ contract, booking, specialTerms, options, defaultHourlyExtensionRate = 200, fullDayExtensionThresholdHours = 12, signatureData, onSignatureChange, staffSignatureData, onStaffSignatureChange, onOptionChange }: { contract?: Omit<Contract, "booking"> | null; booking: BookingRecord; specialTerms: string; options: ContractOptions; defaultHourlyExtensionRate?: number; fullDayExtensionThresholdHours?: number; signatureData?: string; onSignatureChange?: (value: string) => void; staffSignatureData?: string; onStaffSignatureChange?: (value: string) => void; onOptionChange?: (key: keyof ContractOptions, value: string) => void }) {
  const paid = booking.payments?.reduce((sum, payment) => sum + Number(payment.amount), 0) ?? 0;
  const securityDeposit = booking.security_deposit_type === "asset"
    ? booking.security_deposit_asset || "Asset held in lieu of cash deposit"
    : money.format(Number(booking.deposit ?? booking.vehicle?.security_deposit_fee ?? 0));
  const hasSecurityDeposit = booking.security_deposit_type === "asset"
    ? Boolean(booking.security_deposit_asset)
    : Number(booking.deposit ?? booking.vehicle?.security_deposit_fee ?? 0) > 0;
  const dailyRate = Number(booking.rental_rate ?? booking.vehicle?.daily_rate ?? 0);
  const hourlyExtensionRate = Number(booking.vehicle?.hour_extension_rate ?? defaultHourlyExtensionRate);
  return <article className="contract-paper mx-auto max-w-4xl bg-white p-8 text-[#151515] shadow-xl print:max-w-none print:p-12 print:shadow-none">
    <div className="border-b-2 border-[#ff641f] pb-6"><div className="flex items-center justify-center gap-5" aria-label="Registered business logos"><img src="/dti.png" alt="Department of Trade and Industry" className="h-14 w-20 object-contain" /><img src="/clcarhublogo_upscaled.png" alt="CLCarHub" className="h-20 w-20 object-contain" /><img src="/bir.png" alt="Bureau of Internal Revenue" className="h-16 w-20 object-contain" /></div><div className="mt-4 flex items-start justify-between gap-6"><div><p className="text-xs font-bold uppercase tracking-[3px] text-[#ff641f]">CL CARHUB</p><h2 className="mt-2 font-['Space_Grotesk'] text-3xl font-semibold">Vehicle Rental Agreement</h2><p className="mt-2 text-sm text-[#777]">Agreement reference: {booking.reference}</p></div><div className="text-right text-xs text-[#777]"><p>Contract #{contract?.id ?? "Draft"}</p><p className="mt-1">{new Date().toLocaleDateString()}</p></div></div></div>
    <div className="contract-details mt-8 grid gap-6 sm:grid-cols-2"><section><h3 className="text-xs font-bold uppercase tracking-widest text-[#ff641f]">Renter</h3><p className="mt-3 text-lg font-semibold">{booking.customer?.name ?? "—"}</p><p className="mt-1 text-sm text-[#555]">{booking.customer?.email ?? "No email"}</p><p className="text-sm text-[#555]">{booking.customer?.phone ?? "No phone"}</p><p className="mt-2 text-sm text-[#555]">{booking.customer?.address ?? "No address recorded"}</p></section><section><h3 className="text-xs font-bold uppercase tracking-widest text-[#ff641f]">Vehicle</h3><p className="mt-3 text-lg font-semibold">{vehicleLabel(booking)}</p><p className="mt-1 text-sm text-[#555]">{booking.vehicle?.year} · {booking.vehicle?.color} · {booking.vehicle?.type}</p><p className="text-sm text-[#555]">{booking.vehicle?.transmission} · {booking.vehicle?.fuel_type}</p><div className="mt-3 grid grid-cols-2 gap-3 border-t border-black/10 pt-3 text-sm"><div><p className="text-xs text-[#777]">Daily rate</p><p className="font-semibold">{money.format(dailyRate)}</p></div><div><p className="text-xs text-[#777]">Hourly extension rate</p><p className="font-semibold">{money.format(hourlyExtensionRate)}</p></div><div><p className="text-xs text-[#777]">Full-day extension threshold</p><p className="font-semibold">{fullDayExtensionThresholdHours} hours</p></div><div><p className="text-xs text-[#777]">Carwash fee</p><p className="font-semibold">{money.format(Number(booking.vehicle?.carwash_fee ?? 350))}</p></div><div><p className="text-xs text-[#777]">Overall mileage limit</p><p className="font-semibold">{booking.vehicle?.mileage_limit == null ? "No limit listed" : `${booking.vehicle.mileage_limit.toLocaleString()} km total`}</p></div>{hasSecurityDeposit && <div><p className="text-xs text-[#777]">Security deposit held</p><p className="font-semibold">{securityDeposit}</p></div>}</div></section></div>
    <section className="contract-rental-period mt-8"><h3 className="text-xs font-bold uppercase tracking-widest text-[#ff641f]">Rental period</h3><div className="mt-3 grid gap-3 border border-black/10 p-4 sm:grid-cols-2"><div><p className="text-xs text-[#777]">Departure / pickup</p><p className="font-semibold">{dateTime(booking.pickup_at)}</p><p className="mt-1 text-sm text-[#555]">{booking.destination || "—"}</p>{booking.payment_method === "cash_on_delivery" && <><p className="mt-4 text-xs text-[#777]">Delivery location</p><p className="mt-1 text-sm text-[#555]">{booking.delivery_address || "Location pinned on map"}</p></>}</div><div><p className="text-xs text-[#777]">Return</p><p className="font-semibold">{dateTime(booking.return_at)}</p><p className="mt-1 text-sm text-[#555]">{booking.return_address || "—"}</p></div></div></section>
    <section className="contract-charges mt-8"><h3 className="text-xs font-bold uppercase tracking-widest text-[#ff641f]">Charges and payments</h3><p className="mt-2 text-xs text-[#777]">The total booking amount is calculated from the itemized charges below, less any discount. {hasSecurityDeposit ? booking.security_deposit_type === "asset" ? "An asset is held in lieu of the cash security deposit and is not included as a cash charge." : "The cash security deposit is included in the total according to the booking record." : ""}</p><table className="mt-3 w-full text-sm"><tbody><tr className="border-b border-black/10">    <td className="py-2">Rental fees ({rentalAmountLabel(booking)}{rentalDays(booking) > 0 ? ` x ${rentalDays(booking)} day${rentalDays(booking) === 1 ? "" : "s"}` : " · up to 12 hours"})</td><td className="py-2 text-right">{money.format(Number(booking.rental_amount ?? 0))}</td></tr>{booking.addons?.map(addon => <tr className="border-b border-black/10" key={addon.id}><td className="py-2">{addon.name}{addon.quantity > 1 ? ` × ${addon.quantity}` : ""} ({addon.billing_label})</td><td className="py-2 text-right">{money.format(addon.total)}</td></tr>)}{Number(booking.extension_fees ?? 0) > 0 && <tr className="border-b border-black/10"><td className="py-2">Extension fees ({extensionHours(booking)} hour{extensionHours(booking) === 1 ? "" : "s"}{extensionUsesFullDayRate(booking, fullDayExtensionThresholdHours) ? `; full daily rate at ${fullDayExtensionThresholdHours}-hour threshold` : ""})</td><td className="py-2 text-right">{money.format(Number(booking.extension_fees))}</td></tr>}    <tr className="border-b border-black/10"><td className="py-2">Additional charges</td><td className="py-2 text-right">{money.format(Math.max(0, Number(booking.additional_charges ?? 0) - (booking.addons?.reduce((sum, addon) => sum + Number(addon.total), 0) ?? 0)))}</td></tr>{Number(booking.delivery_fee ?? 0) > 0 && <tr className="border-b border-black/10"><td className="py-2">Delivery fee ({money.format(Number(booking.delivery_rate_per_km ?? 0))} x {Number(booking.delivery_distance_km ?? 0).toFixed(2)} km)</td><td className="py-2 text-right">{money.format(Number(booking.delivery_fee))}</td></tr>}{[["Fuel charge", booking.fuel_charge], ["RFID / toll charge", booking.rfid_charge], ["Damage fees", booking.damage_fees], ["Car wash fees", booking.car_wash_fees]].map(([label, value]) => Number(value ?? 0) > 0 && <tr className="border-b border-black/10" key={label as string}><td className="py-2">{label as string}</td><td className="py-2 text-right">{money.format(Number(value))}</td></tr>    )}{hasSecurityDeposit && booking.security_deposit_type !== "asset" && <tr className="border-b border-black/10"><td className="py-2">Cash security deposit</td><td className="py-2 text-right">{securityDeposit}</td></tr>}{hasSecurityDeposit && booking.security_deposit_type === "asset" && <tr className="border-b border-black/10"><td className="py-2">Asset held in lieu of cash deposit</td><td className="py-2 text-right">{securityDeposit}</td></tr>}<tr className="border-b border-black/10"><td className="py-2">Discount</td><td className="py-2 text-right">−{money.format(Number(booking.discount ?? 0))}</td></tr><tr className="border-b-2 border-black font-bold"><td className="py-3">Total booking amount</td><td className="py-3 text-right">{money.format(Number(booking.total_amount))}</td></tr><tr className="border-b border-black/10"><td className="py-2">Payments received ({booking.payments?.length ?? 0})</td><td className="py-2 text-right">{money.format(paid)}</td></tr>{booking.payments?.map((payment, index) => <tr className="text-xs text-[#777]" key={payment.id ?? index}><td className="py-1 pl-4">Payment {index + 1} · {payment.paid_at ? new Date(payment.paid_at).toLocaleDateString() : "No date"}</td><td className="py-1 text-right">{money.format(Number(payment.amount))}</td></tr>)}<tr className="font-bold"><td className="py-3">Outstanding balance</td><td className="py-3 text-right text-[#ff641f]">{money.format(Math.max(0, Number(booking.total_amount) - paid))}</td></tr></tbody></table></section>
    <section className="contract-terms mt-8 space-y-7 text-sm leading-6 text-[#444]"><h3 className="text-xs font-bold uppercase tracking-widest text-[#ff641f]">Agreement terms</h3><div><h4 className="font-bold text-[#151515]">A. RENTAL AGREEMENT</h4><ul className="mt-2 list-disc space-y-2 pl-5"><li>The Owner agrees to rent the vehicle described above to the Renter for the period and price stated in this Agreement.</li><li>The Renter confirms that the information provided is accurate and agrees to comply with these terms.</li></ul></div><div><h4 className="font-bold text-[#151515]">B. DEPOSIT</h4><ul className="mt-2 list-disc space-y-2 pl-5"><li>The Renter agrees to give/leave a valid ID to the Owner{hasSecurityDeposit && <> plus <strong>{securityDeposit}</strong> as {booking.security_deposit_type === "asset" ? "an asset held in lieu of the cash security deposit" : "security deposit"}</>}. {hasSecurityDeposit ? "The deposit may be used to defray fully or partially the cost of repairs or replacement in the event of loss or damage to the vehicle or equipment." : ""}</li><><li>In the absence of damage or loss, the deposit shall be credited toward the rental rate and any excess shall be returned to the Renter.</li><li>The Renter agrees to return the vehicle to the pick-up location no later than the date and time indicated above, in its current condition minus normal road wear-and-tear and with the same fuel expectations.</li><li>The vehicle is for use only within the National Capital Region and nearby provinces, but not outside Luzon. If the Renter departs from any port, the deposit shall be forfeited and the Renter agrees to pay liquidated damages of Php20,000.00.</li></><li>The full rental rate for the specified period is due at pick-up and is non-refundable.</li>{options.strict_destination && <li>Within the DECLARED DESTINATION ONLY for rental price concerns; if the Renter deviates from the said DECLARED DESTINATION, corresponding additional charges shall be applied.</li>}<li>All fuel used shall be paid by the Renter.</li><li>The Renter authorizes the Owner to charge amounts payable to the Renter's nominated debit card, credit card, or pre-arranged charge account.</li></ul></div><div><h4 className="font-bold text-[#151515]">C. CONDITION OF THE VEHICLE</h4><ul className="mt-2 list-disc space-y-2 pl-5"><li>The Owner states, to the best of the Owner's knowledge and belief, that the vehicle is in sound and safe condition and free of known defects that would affect safe operation under normal use.</li><li>The Renter is responsible for returning the vehicle with as much fuel in the tank and RFID balance as when received. Charges apply if the vehicle is returned with less fuel or RFID balance.</li><li>Excess fuel and toll-fee balance are non-refundable.</li>    <li>The Renter confirms that the vehicle was inspected at pick-up and was free of damage, with the fuel tank filled to the current specific level.    </li><li>The Renter agrees to pay {money.format(Number(booking.vehicle?.carwash_fee ?? 350))} for the carwash if the vehicle is returned dirty.</li>{options.no_smoking && <li>The Owner prohibits smoking inside the vehicle. A penalty of Php2,000.00 will be charged to the Renter if this rule is not followed. The Renter shall shoulder all expenses if anything is thrown out inside the seats of the car, including vomit, smelly liquids, food, or similar substances.</li>}</ul></div><div><h4 className="font-bold text-[#151515]">D. RESPONSIBILITY FOR LOSS OR DAMAGE TO THE VEHICLE</h4><ul className="mt-2 list-disc space-y-2 pl-5"><li>In case of damage, the Renter is responsible for restoring the vehicle to its original condition and must promptly contact and report the incident to the Owner.</li>    <li>The Renter shall pay the Owner <strong>{money.format(dailyRate)} per day</strong> until the vehicle is fully operational.</li><li>In case of loss of the vehicle, the Renter is responsible for paying the Owner the full value of the vehicle, regardless of fault.</li></ul></div><div><h4 className="font-bold text-[#151515]">E. RELEASE OF LIABILITY</h4><ul className="mt-2 list-disc space-y-2 pl-5"><li>The Owner is not liable or responsible for valuables left in the vehicle.</li><li>The Renter guarantees that the vehicle shall be used only for lawful purposes and in conformity with applicable laws, ordinances, and regulations, and shall hold the Owner harmless for unlawful use.</li><li>The Owner is not responsible for unforeseen events beyond human control, including broken bridges, impassable roads, commotion, typhoons, or natural calamities that may damage the vehicle or prevent timely arrival.</li>    <li>The vehicle may not be used inside any race track in the Philippines for competition or practice sessions.</li>{options.release_of_liability && <li>The Owner is not liable or responsible for any losses of valuables left in the car. The Renter guarantees lawful use of the vehicle and shall hold the Owner harmless from any unlawful use. The Owner is not responsible for unforeseen events beyond human control, including broken bridges, impassable roads, commotion, typhoons, or natural calamities that may prevent the car from reaching the destination on time.</li>}</ul></div><div><h4 className="font-bold text-[#151515]">F. COURSE OF ACTION</h4><ul className="mt-2 list-disc space-y-2 pl-5"><li>If the Renter violates any stipulation of this Agreement, the Owner may demand restoration and return of the vehicle before the termination of the Agreement.</li><li>Any action may be instituted in the City of Taguig at the option of the Owner.</li><li>The Renter shall defray court costs, attorney's fees, and legal interest.</li><li>An interest charge of 10% per month may be applied to any unpaid balance or unpaid charges outstanding for 30 days, plus other related costs.</li></ul></div><div><h4 className="font-bold text-[#151515]">G. INTEGRATION</h4><ul className="mt-2 list-disc space-y-2 pl-5"><li>The parties agree that all stipulations, terms, and conditions appearing on the front page of this Agreement form an integral part of this Agreement.</li></ul></div>{specialTerms && <div className="whitespace-pre-wrap border-l-2 border-[#ff641f] bg-[#fff7f3] p-4"><strong>Special terms</strong><p className="mt-2">{specialTerms}</p></div>}</section>
    <section className="contract-effectivity mt-8 text-sm leading-6 text-[#444]"><h4 className="font-bold text-[#151515]">H. EFFECTIVITY</h4><ul className="mt-2 list-disc space-y-2 pl-5"><li>This Agreement shall take effect upon the delivery/pick-up of the rented vehicle.</li></ul></section>
    <div className="contract-signatures mt-16 grid gap-10 sm:grid-cols-2"><div className="min-h-24 text-sm">{onSignatureChange ? <div><div className="print:hidden"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#777]">Renter e-signature</p><SignaturePad value={signatureData ?? ""} onChange={onSignatureChange} /></div>{signatureData && <img src={signatureData} alt="Renter electronic signature" className="mb-2 hidden h-16 max-w-full object-contain object-left print:block" />}</div> : contract?.signature_data && <img src={contract.signature_data} alt="Renter electronic signature" className="mb-2 h-16 max-w-full object-contain object-left" />}<span className="mt-2 block border-t border-black/30 pt-2">Renter signature and date</span></div><div className="min-h-24 text-sm">{onStaffSignatureChange ? <div><div className="print:hidden"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#777]">Staff e-signature</p><SignaturePad value={staffSignatureData ?? ""} onChange={onStaffSignatureChange} /></div>{staffSignatureData && <img src={staffSignatureData} alt="Staff electronic signature" className="mb-2 hidden h-16 max-w-full object-contain object-left print:block" />}</div> : contract?.staff_signature_data && <img src={contract.staff_signature_data} alt="Staff electronic signature" className="mb-2 h-16 max-w-full object-contain object-left" />}<span className="mt-2 block border-t border-black/30 pt-2">{booking.assigned_to?.name || "Authorized CL CarHub representative"}</span></div></div>
    <section className="contract-rfid mt-12"><table className="w-full border-collapse border border-black text-center text-sm"><thead><tr className="font-bold"><th className="border border-black px-4 py-2">RFID / FUEL</th><th className="border border-black px-4 py-2">BEFORE</th><th className="border border-black px-4 py-2">AFTER</th></tr></thead><tbody>{[["EASYTRIP", "easytrip_before", "easytrip_after"], ["AUTOSWEEP", "autosweep_before", "autosweep_after"], ["FUEL", "fuel_before", "fuel_after"]].map(([label, beforeKey, afterKey]) => <tr key={label}><th className="border border-black px-4 py-3 text-xs">{label}</th>{[beforeKey, afterKey].map(key => <td className="h-12 border border-black px-2 py-2" key={key}>{onOptionChange ? <><input readOnly={["easytrip_before", "easytrip_after", "autosweep_before", "autosweep_after", "fuel_before", "fuel_after"].includes(key)} className="w-full border-0 bg-white text-center text-[#151515] outline-none placeholder:text-[#999] read-only:bg-[#f8f7f5] print:hidden" value={String(options[key as keyof ContractOptions] ?? "")} onChange={event => onOptionChange(key as keyof ContractOptions, event.target.value)} placeholder="Recorded during handover/return" aria-label={`${label} ${key.endsWith("before") ? "before" : "after"}`} /><span className="hidden print:inline">{String(options[key as keyof ContractOptions] ?? "")}</span></> : <span>{String(options[key as keyof ContractOptions] ?? "")}</span>}</td>)}</tr>)}</tbody></table></section>
  </article>;
}

export default function ContractBuilderPage() {
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [fullDayExtensionThresholdHours, setFullDayExtensionThresholdHours] = useState(12);
  const [defaultHourlyExtensionRate, setDefaultHourlyExtensionRate] = useState(200);
  const [selectedBookingId, setSelectedBookingId] = useState("");
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [specialTerms, setSpecialTerms] = useState("");
  const [signatureData, setSignatureData] = useState("");
  const [staffSignatureData, setStaffSignatureData] = useState("");
  const [isContractFullscreen, setIsContractFullscreen] = useState(false);
  const contractSurfaceRef = useRef<HTMLDivElement>(null);
  const [options, setOptions] = useState<ContractOptions>(defaultContractOptions);
  const [status, setStatus] = useState("draft");
  const [search, setSearch] = useState("");
  const [bookingPage, setBookingPage] = useState(1);
  const selectedBooking = bookings.find(booking => String(booking.id) === selectedBookingId);
  const filteredBookings = useMemo(() => bookings.filter(booking => `${booking.reference} ${booking.customer?.name ?? ""} ${vehicleLabel(booking)}`.toLowerCase().includes(search.toLowerCase())), [bookings, search]);
  const bookingsPerPage = 6;
  const bookingPageCount = Math.max(1, Math.ceil(filteredBookings.length / bookingsPerPage));
  const visibleBookings = filteredBookings.slice((bookingPage - 1) * bookingsPerPage, bookingPage * bookingsPerPage);
  const load = useCallback(async () => {
    try {
      const [firstBookingResponse, contractResponse, settingsResponse] = await Promise.all([api.get<PaginatedBookings>("/bookings?per_page=100&page=1"), api.get<Contract[]>("/contracts"), api.get<FleetSettings>("/fleet-settings")]);
      const allBookings = [...firstBookingResponse.data.data];
      for (let page = firstBookingResponse.data.current_page + 1; page <= firstBookingResponse.data.last_page; page += 1) {
        const response = await api.get<PaginatedBookings>(`/bookings?per_page=100&page=${page}`);
        allBookings.push(...response.data.data);
      }
      setBookings(allBookings); setContracts(contractResponse.data); setFullDayExtensionThresholdHours(settingsResponse.data.full_day_extension_threshold_hours); setDefaultHourlyExtensionRate(Number(settingsResponse.data.default_hour_extension_rate ?? 200));
    } catch (error) { showToast(error instanceof Error ? error.message : "Unable to load contracts", "error"); }
  }, [showToast]);
  // Loading remote contract data is an external synchronization effect.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  // Search changes should show the first matching booking.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setBookingPage(1); }, [search]);
  const chooseBooking = useCallback((bookingId: string) => {
    setSelectedBookingId(bookingId);
    const booking = bookings.find(item => String(item.id) === bookingId);
    const existing = contracts.find(contract => String(contract.booking_id) === bookingId);
    setSelectedContract(existing ?? null); setSpecialTerms(existing?.special_terms ?? ""); setSignatureData(existing?.signature_data ?? ""); setStaffSignatureData(existing?.staff_signature_data ?? ""); setStatus(existing?.status ?? "draft"); setOptions({
      ...defaultContractOptions,
      ...(existing?.options ?? {}),
      ...(booking?.handover_easytrip != null ? { easytrip_before: String(booking.handover_easytrip) } : {}),
      ...(booking?.handover_autosweep != null ? { autosweep_before: String(booking.handover_autosweep) } : {}),
      ...(booking?.handover_fuel_bars != null ? { fuel_before: String(booking.handover_fuel_bars) } : {}),
      ...(booking?.return_easytrip != null ? { easytrip_after: String(booking.return_easytrip) } : {}),
      ...(booking?.return_autosweep != null ? { autosweep_after: String(booking.return_autosweep) } : {}),
      ...(booking?.return_fuel_bars != null ? { fuel_after: String(booking.return_fuel_bars) } : {}),
    });
  }, [bookings, contracts]);
  // Select the booking requested by the booking details action after remote data loads.
  useEffect(() => {
    const bookingId = searchParams.get("booking");
    if (bookingId && bookings.some(booking => String(booking.id) === bookingId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      chooseBooking(bookingId);
    }
  }, [bookings, chooseBooking, searchParams]);
  const save = async () => {
    if (!selectedBooking) return;
    try {
      const payload = { status, special_terms: specialTerms, signature_data: signatureData || null, staff_signature_data: staffSignatureData || null, options };
      if (selectedContract) await api.patch(`/contracts/${selectedContract.id}`, payload);
      else { const response = await api.post<Contract>("/contracts", { booking_id: selectedBooking.id, ...payload }); setSelectedContract(response.data); }
      await load(); showToast("Contract saved.", "success");
    } catch (error) { showToast(error instanceof Error ? error.message : "Unable to save contract", "error"); }
  };
  const toggleContractFullscreen = async () => {
    if (!contractSurfaceRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await contractSurfaceRef.current.requestFullscreen();
  };
  useEffect(() => {
    const handleFullscreenChange = () => setIsContractFullscreen(document.fullscreenElement === contractSurfaceRef.current);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);
  return <AdminShell title="Contract Builder"><div className="mt-8 space-y-6 print:m-0 print:mt-0">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center print:hidden"><p className="text-sm text-[#777]">Create a polished rental agreement from an existing booking.</p><div className="flex flex-wrap gap-2"><button className="border border-black/15 bg-white px-4 py-3 text-sm font-bold" disabled={!selectedBooking} onClick={() => void toggleContractFullscreen()}>{isContractFullscreen ? "Exit fullscreen" : "View contract fullscreen"}</button><button className="bg-[#151515] px-4 py-3 text-sm font-bold text-white" disabled={!selectedBooking} onClick={() => window.print()}>Print / Save as PDF</button></div></div>
    <section className="rounded border border-black/10 bg-white p-5 print:hidden"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold">Select a booking</h3><p className="mt-1 text-xs text-[#777]">Choose a booking to populate the rental agreement.</p></div><input className="border border-black/10 px-3 py-2.5 text-sm sm:w-72" placeholder="Search reference, renter, vehicle..." value={search} onChange={event => setSearch(event.target.value)} /></div><div className="mt-4 grid gap-3 xl:grid-cols-2">{visibleBookings.map(booking =>     <BookingCard key={booking.id} booking={booking} contractStatus={contracts.find(contract => contract.booking_id === booking.id)?.status} selected={String(booking.id) === selectedBookingId} onSelect={() => chooseBooking(String(booking.id))} />)}</div>{filteredBookings.length === 0 ? <p className="mt-4 py-5 text-center text-sm text-[#777]">No matching bookings found.</p> : <div className="mt-5 flex flex-col gap-3 border-t border-black/10 pt-4 text-sm sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-[#777]">Showing {(bookingPage - 1) * bookingsPerPage + 1}–{Math.min(bookingPage * bookingsPerPage, filteredBookings.length)} of {filteredBookings.length} bookings</p><div className="flex gap-2"><button type="button" className="border border-black/10 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-40" disabled={bookingPage === 1} onClick={() => setBookingPage(page => page - 1)}>Previous</button><span className="px-2 py-2 text-xs text-[#777]">Page {bookingPage} of {bookingPageCount}</span><button type="button" className="border border-black/10 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-40" disabled={bookingPage === bookingPageCount} onClick={() => setBookingPage(page => page + 1)}>Next</button></div></div>}</section>
    {selectedBooking && <div className="grid gap-6 lg:grid-cols-[280px_1fr] print:block"><aside className="space-y-4 print:hidden"><section className="rounded border border-black/10 bg-white p-5"><h3 className="font-semibold">Contract details</h3><label className="mt-4 block text-xs text-[#777]">Status<select className="mt-2 w-full border border-black/10 px-3 py-2.5 text-sm" value={status} onChange={event => setStatus(event.target.value)}><option value="draft">Draft</option><option value="generated">Generated</option><option value="signed">Signed</option><option value="completed">Completed</option>    <option value="cancelled">Cancelled</option></select></label><div className="mt-5 space-y-3"><p className="text-xs font-semibold uppercase tracking-wide text-[#777]">Agreement options</p>{[["strict_destination", "Strict destination"], ["release_of_liability", "Release of liability"], ["no_smoking", "No smoking"]].map(([key, label]) => <label className="flex items-center gap-2 text-sm text-[#444]" key={key}><input type="checkbox" checked={Boolean(options[key as keyof ContractOptions])} onChange={event => setOptions(current => ({ ...current, [key]: event.target.checked }))} />{label}</label>)}</div><label className="mt-4 block text-xs text-[#777]">Special terms<textarea className="mt-2 min-h-32 w-full border border-black/10 px-3 py-2.5 text-sm" value={specialTerms} onChange={event => setSpecialTerms(event.target.value)} placeholder="Optional custom terms..." /></label><button className="mt-4 w-full bg-[#ff641f] px-4 py-3 text-sm font-bold text-white" onClick={() => void save()}>{selectedContract ? "Save changes" : "Save contract"}</button></section></aside>            <div ref={contractSurfaceRef} className="fullscreen-contract min-w-0 overflow-y-auto bg-[#f4f3f0]">        <ContractPreview contract={selectedContract ? { ...selectedContract, signature_data: signatureData, staff_signature_data: staffSignatureData } : null} booking={selectedBooking} specialTerms={specialTerms} options={options} defaultHourlyExtensionRate={defaultHourlyExtensionRate} fullDayExtensionThresholdHours={fullDayExtensionThresholdHours} signatureData={signatureData} onSignatureChange={setSignatureData} staffSignatureData={staffSignatureData} onStaffSignatureChange={setStaffSignatureData} onOptionChange={(key, value) => setOptions(current => ({ ...current, [key]: value }))} /></div></div>}
  </div></AdminShell>;
}
