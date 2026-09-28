export type VehicleRecord = { id: number; brand: string; model: string; type: string; plate_number: string; daily_rate: string; status: string }
export type BookingRecord = { id: number; reference: string; pickup_at: string; return_at: string; status: string; total_amount: string; customer?: { name: string }; vehicle?: { brand: string; model: string } }
export type Paginated<T> = { data: T[]; total: number }
