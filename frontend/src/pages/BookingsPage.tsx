import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AdminShell } from '../components/AdminShell'
import api from '../lib/api'
import type { BookingRecord, Paginated, VehicleRecord } from '../types'
import { useToast } from '../components/Ui'

type Customer = { id: number; name: string; email?: string; phone: string; address?: string }
type Payment = { amount: string; notes: string; paid_at: string }
type BookingForm = {
  vehicle_id: string; customer_id: string; pickup_at: string; return_at: string; destination: string
  delivery_address: string; return_address: string; notes: string; fuel_charge: string; rfid_charge: string
  damage_fees: string; car_wash_fees: string; extension_fees: string; payments: Payment[]
}

const emptyPayment = (): Payment => ({ amount: '', notes: '', paid_at: new Date().toISOString().slice(0, 10) })
const emptyForm: BookingForm = { vehicle_id: '', customer_id: '', pickup_at: '', return_at: '', destination: '', delivery_address: '', return_address: '', notes: '', fuel_charge: '', rfid_charge: '', damage_fees: '', car_wash_fees: '', extension_fees: '', payments: [] }
const feeFields: Array<[keyof BookingForm, string]> = [['fuel_charge', 'Fuel charge'], ['rfid_charge', 'RFID charge'], ['damage_fees', 'Damage fees'], ['car_wash_fees', 'Car wash fees'], ['extension_fees', 'Extension fees']]

function dateTimeLocalValue(value: string): string {
  const date = new Date(value)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function calendarDays(start: string, end: string): number {
  const startDate = new Date(start)
  const endDate = new Date(end)
  return Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000))
}

function bookingDate(value: string): string {
  const date = new Date(value)
  return date.toLocaleDateString()
}

export default function BookingsPage() {
  const { showToast } = useToast()
  const [bookings, setBookings] = useState<BookingRecord[]>([])
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [addCustomer, setAddCustomer] = useState(false)
  const [newCustomer, setNewCustomer] = useState({ name: '', email: '', phone: '', address: '' })
  const [searchParams, setSearchParams] = useSearchParams()

  const loadBookings = useCallback(() => {
    setLoading(true)
    api.get<Paginated<BookingRecord>>(`/bookings?per_page=50${status ? `&status=${status}` : ''}`).then(result => setBookings(result.data.data)).catch(e => setError(e instanceof Error ? e.message : 'Unable to load bookings')).finally(() => setLoading(false))
  }, [status])
  useEffect(() => { const timer = window.setTimeout(loadBookings, 0); return () => window.clearTimeout(timer) }, [loadBookings])
  useEffect(() => {
    Promise.all([api.get<Paginated<VehicleRecord>>('/vehicles?per_page=100'), api.get<Paginated<Customer>>('/customers?per_page=100')])
      .then(([vehicleResult, customerResult]) => { setVehicles(vehicleResult.data.data); setCustomers(customerResult.data.data) })
      .catch(e => setError(e instanceof Error ? e.message : 'Unable to load booking options'))
  }, [])

  const setField = (key: keyof BookingForm, value: string) => setForm(current => ({ ...current, [key]: value }))
  const openCreate = () => { setEditing(null); setForm(emptyForm); setAddCustomer(false); setShowForm(true) }
  const openEdit = (booking: BookingRecord) => {
    setEditing(booking.id)
    setForm({ ...emptyForm, vehicle_id: String(booking.vehicle?.id ?? ''), customer_id: String(booking.customer?.id ?? ''), pickup_at: dateTimeLocalValue(booking.pickup_at), return_at: dateTimeLocalValue(booking.return_at), destination: booking.destination ?? '', delivery_address: booking.delivery_address ?? '', return_address: booking.return_address ?? '', notes: booking.notes ?? '', fuel_charge: booking.fuel_charge ?? '', rfid_charge: booking.rfid_charge ?? '', damage_fees: booking.damage_fees ?? '', car_wash_fees: booking.car_wash_fees ?? '', extension_fees: booking.extension_fees ?? '', payments: booking.payments?.map(payment => ({ amount: payment.amount, notes: payment.notes ?? '', paid_at: payment.paid_at.slice(0, 10) })) ?? [] })
    setShowForm(true)
  }

  useEffect(() => {
    const editId = Number(searchParams.get('edit'))
    const booking = bookings.find(item => item.id === editId)
    if (booking && !showForm) {
      openEdit(booking)
      searchParams.delete('edit')
      setSearchParams(searchParams, { replace: true })
    }
  }, [bookings, searchParams, setSearchParams, showForm])

  const saveCustomer = async () => {
    const result = await api.post<Customer>('/customers', newCustomer)
    setCustomers(current => [...current, result.data])
    setForm(current => ({ ...current, customer_id: String(result.data.id) }))
    setNewCustomer({ name: '', email: '', phone: '', address: '' }); setAddCustomer(false)
  }

  const saveBooking = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    const numeric = (value: string) => value ? Number(value) : 0
    const payload = { ...form, payments: form.payments.filter(payment => payment.amount).map(payment => ({ ...payment, amount: numeric(payment.amount) })), ...Object.fromEntries(feeFields.map(([key]) => [key, numeric(form[key] as string)])) }
    try {
      if (editing) await api.patch(`/bookings/${editing}`, payload)
      else await api.post('/bookings', payload)
      setShowForm(false); loadBookings(); showToast(editing ? 'Booking updated successfully.' : 'Booking created successfully.', 'success')
    } catch (e) { showToast(e instanceof Error ? e.message : 'Unable to save booking', 'error') }
  }

  const updateStatus = async (booking: BookingRecord, nextStatus: string) => { try { await api.patch(`/bookings/${booking.id}`, { status: nextStatus }); loadBookings(); showToast('Booking status updated.', 'success') } catch (e) { showToast(e instanceof Error ? e.message : 'Unable to update booking', 'error') } }
  const selectedVehicle = vehicles.find(vehicle => String(vehicle.id) === form.vehicle_id)
  const rentalDays = form.pickup_at && form.return_at ? calendarDays(form.pickup_at, form.return_at) : 0
  const subtotal = rentalDays * Number(selectedVehicle?.daily_rate ?? 0)
  const optionalFees = feeFields.reduce((sum, [key]) => sum + Number(form[key] || 0), 0)
  const reservationFee = Number(selectedVehicle?.reservation_fee ?? 0)
  const securityDeposit = Number(selectedVehicle?.security_deposit_fee ?? 0)
  const formTotal = subtotal + optionalFees + reservationFee + securityDeposit
  const formPaid = form.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  const formBalance = Math.max(0, formTotal - formPaid)
  const bookingSortRank = (booking: BookingRecord) => booking.status === 'pending' ? 0 : ['cancelled', 'rejected'].includes(booking.status) ? 2 : 1
  const sortedBookings = [...bookings].sort((left, right) => bookingSortRank(left) - bookingSortRank(right))

  return <AdminShell title="Booking management"><div className="mt-8 border border-black/10 bg-white p-4 md:p-6">
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><p className="text-sm text-[#777]">Create, update, and track rental bookings and balances.</p><div className="flex gap-3"><select className="border border-black/10 bg-[#f8f7f5] px-4 py-3 text-sm" value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{['pending', 'confirmed', 'active', 'completed', 'cancelled', 'rejected'].map(value => <option key={value}>{value}</option>)}</select><button className="bg-[#ff641f] px-5 py-3 text-sm font-bold text-white" onClick={openCreate}>+ Add booking</button></div></div>
    {showForm && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4"><form className="max-h-[85vh] w-full max-w-[64rem] overflow-y-auto bg-white p-6 shadow-2xl" onSubmit={saveBooking}><div className="flex items-center justify-between"><h2 className="font-['Space_Grotesk'] text-2xl font-semibold">{editing ? 'Edit booking' : 'Add booking'}</h2><button type="button" className="text-2xl text-[#777]" onClick={() => setShowForm(false)}>×</button></div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="text-xs text-[#777]">Vehicle<select required className="mt-2 w-full border border-black/10 px-3 py-2.5 text-sm" value={form.vehicle_id} onChange={e => setField('vehicle_id', e.target.value)}><option value="">Select vehicle</option>{vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.name || `${vehicle.brand} ${vehicle.model}`}</option>)}</select></label>
        <label className="text-xs text-[#777]">Customer<div className="mt-2 flex gap-2"><select required className="min-w-0 flex-1 border border-black/10 px-3 py-2.5 text-sm" value={form.customer_id} onChange={e => setField('customer_id', e.target.value)}><option value="">Select customer</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select><button type="button" className="border border-[#ff641f] px-3 text-[#ff641f]" onClick={() => setAddCustomer(value => !value)}>+ Add</button></div></label>
        {addCustomer && <div className="border border-orange-200 bg-orange-50 p-4 md:col-span-2"><p className="text-sm font-semibold">New customer</p><div className="mt-3 grid gap-3 md:grid-cols-2">{[['name', 'Name', true], ['email', 'Email', false], ['phone', 'Phone', true], ['address', 'Address', false]].map(([key, label, required]) => <label className="text-xs text-[#777]" key={key as string}>{label as string}<input className="mt-1 w-full border border-black/10 bg-white px-3 py-2 text-sm" type={key === 'email' ? 'email' : 'text'} required={required as boolean} value={newCustomer[key as keyof typeof newCustomer]} onChange={e => setNewCustomer({ ...newCustomer, [key as keyof typeof newCustomer]: e.target.value })} /></label>)}</div><button type="button" className="mt-3 bg-[#151515] px-4 py-2 text-xs font-bold text-white" onClick={() => saveCustomer().then(() => showToast('Customer added successfully.', 'success')).catch(e => showToast(e instanceof Error ? e.message : 'Unable to add customer', 'error'))}>Save customer</button></div>}
        <label className="text-xs text-[#777]">Start date & time<input required className="mt-2 w-full border border-black/10 px-3 py-2.5 text-sm" type="datetime-local" value={form.pickup_at} onChange={e => setField('pickup_at', e.target.value)} /></label>
        <label className="text-xs text-[#777]">End date & time<input required className="mt-2 w-full border border-black/10 px-3 py-2.5 text-sm" type="datetime-local" value={form.return_at} onChange={e => setField('return_at', e.target.value)} /></label>
        {([['destination', 'Destination', true], ['delivery_address', 'Delivery address (optional)', false], ['return_address', 'Return address (optional)', false]] as const).map(([key, label, required]) => <label className="text-xs text-[#777]" key={key}>{label}<input className="mt-2 w-full border border-black/10 px-3 py-2.5 text-sm" required={required} value={form[key]} onChange={e => setField(key, e.target.value)} /></label>)}
        <label className="text-xs text-[#777] md:col-span-2">Remarks<textarea className="mt-2 min-h-24 w-full border border-black/10 px-3 py-2.5 text-sm" value={form.notes} onChange={e => setField('notes', e.target.value)} /></label>
      </div>
      {editing && <div className="mt-6 border-t border-black/10 pt-5"><h3 className="font-semibold">Additional charges</h3><div className="mt-3 grid gap-3 md:grid-cols-3">{feeFields.map(([key, label]) => <label className="text-xs text-[#777]" key={key}>{label}<input className="mt-1 w-full border border-black/10 px-3 py-2 text-sm" type="number" min="0" step="0.01" value={form[key] as string} onChange={e => setField(key, e.target.value)} /></label>)}</div></div>}
      <div className="mt-6 border-t border-black/10 pt-5"><div className="flex items-center justify-between"><h3 className="font-semibold">Booking payments</h3><button type="button" className="text-sm text-[#ff641f]" onClick={() => setForm(current => ({ ...current, payments: [...current.payments, emptyPayment()] }))}>+ Add payment</button></div>{form.payments.map((payment, index) => <div className="mt-3 grid gap-3 border border-black/10 p-3 md:grid-cols-[1fr_2fr_1fr_auto]" key={index}><input className="border border-black/10 px-3 py-2 text-sm" type="number" min="0" step="0.01" placeholder="Amount" value={payment.amount} onChange={e => setForm(current => ({ ...current, payments: current.payments.map((item, itemIndex) => itemIndex === index ? { ...item, amount: e.target.value } : item) }))} /><input className="border border-black/10 px-3 py-2 text-sm" placeholder="Payment note" value={payment.notes} onChange={e => setForm(current => ({ ...current, payments: current.payments.map((item, itemIndex) => itemIndex === index ? { ...item, notes: e.target.value } : item) }))} /><input className="border border-black/10 px-3 py-2 text-sm" type="date" value={payment.paid_at} onChange={e => setForm(current => ({ ...current, payments: current.payments.map((item, itemIndex) => itemIndex === index ? { ...item, paid_at: e.target.value } : item) }))} /><button type="button" className="text-red-600" onClick={() => setForm(current => ({ ...current, payments: current.payments.filter((_, itemIndex) => itemIndex !== index) }))}>Remove</button></div>)}</div>
      <div className="mt-6 border-t border-black/10 pt-5"><h3 className="font-semibold">Receipt summary</h3><div className="mt-3 max-w-md space-y-2 text-sm"><div className="flex justify-between"><span className="text-[#777]">Subtotal ({rentalDays} day{rentalDays === 1 ? '' : 's'})</span><span>₱{subtotal.toLocaleString()}</span></div>{feeFields.map(([key, label]) => Number(form[key] || 0) > 0 && <div className="flex justify-between" key={key}><span className="text-[#777]">{label}</span><span>₱{Number(form[key]).toLocaleString()}</span></div>)}{reservationFee > 0 && <div className="flex justify-between"><span className="text-[#777]">Reservation fee</span><span>₱{reservationFee.toLocaleString()}</span></div>}{securityDeposit > 0 && <div className="flex justify-between"><span className="text-[#777]">Security deposit</span><span>₱{securityDeposit.toLocaleString()}</span></div>}<div className="flex justify-between border-t border-black/10 pt-2 font-semibold"><span>Total</span><span>₱{formTotal.toLocaleString()}</span></div><div className="flex justify-between"><span className="text-[#777]">Payments</span><span>- ₱{formPaid.toLocaleString()}</span></div><div className="flex justify-between border-t border-black/10 pt-2 text-base font-bold text-[#ff641f]"><span>Remaining balance</span><span>₱{formBalance.toLocaleString()}</span></div></div></div>
      <div className="mt-6 flex justify-end gap-3"><button type="button" className="border border-black/10 px-4 py-2 text-sm" onClick={() => setShowForm(false)}>Cancel</button><button className="bg-[#151515] px-5 py-2 text-sm font-bold text-white">Save booking</button></div>
    </form></div>}
    {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="border-b border-black/10 text-[10px] uppercase tracking-widest text-[#888]"><tr><th className="pb-3">Reference</th><th className="pb-3">Customer</th><th className="pb-3">Vehicle</th><th className="pb-3">Dates</th><th className="pb-3">Balance</th><th className="pb-3">Status</th><th /></tr></thead><tbody>{loading ? <tr><td className="py-8 text-[#888]" colSpan={7}>Loading bookings...</td></tr> : sortedBookings.map(booking => { const isPending = booking.status === 'pending'; const isCancelled = booking.status === 'cancelled'; const isRejected = booking.status === 'rejected'; const rowClass = isPending ? 'border-b border-black/[.06] bg-yellow-100/70' : isRejected ? 'border-b border-red-200 bg-red-100/60 text-red-900 opacity-75' : isCancelled ? 'border-b border-black/[.06] bg-gray-100 text-gray-500 opacity-75' : 'border-b border-black/[.06]'; return <tr className={rowClass} key={booking.id}><td className="py-4 font-semibold text-[#ff641f]">{booking.reference}</td><td className="py-4">{booking.customer?.name ?? '—'}</td><td className="py-4 text-[#777]">{booking.vehicle ? (booking.vehicle.name || `${booking.vehicle.brand} ${booking.vehicle.model}`) : '—'}</td><td className="py-4 text-xs text-[#777]">{bookingDate(booking.pickup_at)} → {bookingDate(booking.return_at)}</td><td className="py-4">₱{Number(booking.balance ?? 0).toLocaleString()}</td><td className="py-4"><select className="border border-black/10 bg-[#f8f7f5] px-2 py-1 text-xs capitalize" value={booking.status} onChange={e => updateStatus(booking, e.target.value)}>{['pending', 'confirmed', 'active', 'completed', 'cancelled', 'rejected'].map(value => <option key={value}>{value}</option>)}</select></td><td className="py-4 text-right"><button className="text-[#ff641f]" onClick={() => openEdit(booking)}>Edit</button></td></tr> })}</tbody></table></div>
  </div></AdminShell>
}
