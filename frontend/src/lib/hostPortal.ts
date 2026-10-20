import { useEffect, useState } from "react";
import api from "./api";

export type HostVehicle = {
  id: number;
  name?: string;
  brand: string;
  model: string;
  plate_number: string;
  aika_device_id?: string | null;
  images?: Array<{ url?: string; image_type?: string | null; is_primary?: boolean }>;
  partner_contracts: Array<{ status: string }>;
};

export type HostEarning = {
  id: number;
  net_amount: string;
  earned_at: string;
  created_at?: string;
  status?: string;
  vehicle?: { name?: string; brand: string; model: string };
  booking?: { reference?: string };
};

export type HostPayout = {
  id: number;
  amount: string;
  status: string;
  paid_at?: string | null;
  created_at?: string;
  payment_reference?: string | null;
  notes?: string | null;
};

export type HostContractDocument = {
  id: number;
  original_name: string;
  mime_type: string;
  url: string;
};

export type HostDashboardData = {
  partner: {
    name: string;
    email: string;
    vehicles: HostVehicle[];
    contract_documents: HostContractDocument[];
    earnings: HostEarning[];
    payouts: HostPayout[];
  };
  summary: { gross_earnings: number; net_earnings: number; paid_out: number; outstanding: number };
};

export function useHostDashboard() {
  const [data, setData] = useState<HostDashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<HostDashboardData>("/host/dashboard")
      .then(response => setData(response.data))
      .catch(requestError => setError(requestError instanceof Error ? requestError.message : "Unable to load host data"))
      .finally(() => setLoading(false));
  }, []);

  return { data, error, loading };
}

export function formatBusinessDate(value?: string | null, timeValue?: string | null): string {
  if (!value) return "Date unavailable";
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  const formattedDate = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
  if (!timeValue) return formattedDate;
  const timestamp = new Date(timeValue);
  if (Number.isNaN(timestamp.getTime())) return formattedDate;
  return `${formattedDate}, ${new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp)}`;
}
