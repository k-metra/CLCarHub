export type VehicleImage = { id: number; path: string; url: string }
export type VehicleRecord = { id: number; name: string; brand: string; model: string; year: number; color: string; type: string; transmission: string; fuel_type: string; plate_number: string; seats: number; daily_rate: string; reservation_fee?: string; security_deposit_fee?: string; status: string; ownership?: string; partner_id?: number; partner?: PartnerRecord; coding_day?: string | null; is_coding_today?: boolean; images?: VehicleImage[] }
export type PartnerRecord = { id: number; name: string; email: string; contact_number: string; address: string; commission_based_on: string; commission_type: string; commission_value: string; vehicles_count?: number }
export type BookingRecord = { id: number; reference: string; pickup_at: string; return_at: string; status: string; total_amount: string; customer?: { name: string }; vehicle?: VehicleRecord }
export type Paginated<T> = { data: T[]; total: number }
