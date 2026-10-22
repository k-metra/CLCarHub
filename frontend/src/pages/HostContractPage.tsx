import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { HostShell } from "../components/HostShell";
import { useToast } from "../components/Ui";
import api from "../lib/api";
import { ContractPreview, type Contract, type ContractOptions } from "./ContractBuilderPage";
import type { BookingRecord } from "../types";

type HostContractResponse = BookingRecord & {
  contract?: Omit<Contract, "booking"> & {
    host_details?: {
      rate?: number | string | null;
      total_amount?: number | string | null;
      special_terms?: string | null;
    } | null;
    host_contract_images?: string[];
  } | null;
};

const defaultOptions: ContractOptions = {
  strict_destination: false,
  release_of_liability: false,
  no_smoking: false,
  carwash_payment: "",
};

function rentalDays(booking: BookingRecord): number {
  return Math.max(1, Math.floor((new Date(booking.return_at).getTime() - new Date(booking.pickup_at).getTime()) / 86400000));
}

function hostTotal(booking: BookingRecord, hostRate: number | null, override?: number | string | null): string {
  if (override != null) return String(override);
  if (hostRate == null) return String(booking.total_amount);
  return String(Number(booking.total_amount ?? 0) - Number(booking.rental_amount ?? 0) + hostRate * rentalDays(booking));
}

export default function HostContractPage() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [data, setData] = useState<HostContractResponse | null>(null);

  useEffect(() => {
    if (!bookingId) return;
    api.get<HostContractResponse>(`/host/bookings/${bookingId}/contract`)
      .then(response => setData(response.data))
      .catch(error => showToast(error instanceof Error ? error.message : "Unable to load contract", "error"));
  }, [bookingId, showToast]);

  if (!data) {
    return <HostShell title="Booking contract"><p className="mt-8 text-sm text-[#777]">Loading contract...</p></HostShell>;
  }

  if (!data.contract) {
    return <HostShell title="Booking contract"><section className="mt-8 border border-black/10 bg-white p-6"><p className="text-sm text-[#777]">This booking does not have a contract available yet.</p><button type="button" className="mt-4 border border-black/15 px-4 py-2 text-sm font-semibold" onClick={() => navigate("/host/bookings")}>Back to bookings</button></section></HostShell>;
  }

  const hostDetails = data.contract.host_details ?? {};
  const hostRate = hostDetails.rate == null ? null : Number(hostDetails.rate);
  const booking: BookingRecord = {
    ...data,
    rental_rate: hostRate == null ? data.rental_rate : String(hostRate),
    rental_amount: hostRate == null ? data.rental_amount : String(hostRate * rentalDays(data)),
    total_amount: hostTotal(data, hostRate, hostDetails.total_amount),
  };
  const options: ContractOptions = { ...defaultOptions, ...(data.contract.options ?? {}) };
  const physicalImages = data.contract.host_contract_images ?? [];

  return <HostShell title="Booking contract">
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
      <div><p className="text-sm text-[#777]">Host view of booking {data.reference}</p><p className="mt-1 text-xs text-[#999]">Rates and other host-specific changes are reflected below.</p></div>
      <div className="flex gap-2"><button type="button" className="border border-black/15 px-4 py-2 text-sm font-semibold" onClick={() => navigate("/host/bookings")}>Back</button><button type="button" className="bg-[#151515] px-4 py-2 text-sm font-bold text-white" onClick={() => window.print()}>Print / Save as PDF</button></div>
    </div>
    <div className="mt-6 print:mt-0">
      <ContractPreview contract={data.contract} booking={booking} specialTerms={hostDetails.special_terms ?? data.contract.special_terms ?? ""} options={options} />
    </div>
    {physicalImages.length > 0 && <section className="mt-8 border border-black/10 bg-white p-6 print:hidden"><h2 className="text-lg font-semibold">Physical contract images</h2><p className="mt-1 text-sm text-[#777]">Photos and scans uploaded by CL CarHub staff.</p><div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">{physicalImages.map((url, index) => <a href={url} target="_blank" rel="noreferrer" key={url}><img src={url} alt={`Physical contract page ${index + 1}`} className="aspect-square w-full rounded border border-black/10 object-cover" /></a>)}</div></section>}
  </HostShell>;
}
