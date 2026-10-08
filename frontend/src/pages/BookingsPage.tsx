import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AdminShell } from '../components/AdminShell'
import { DateTimePicker } from '../components/DateTimePicker'
import api from '../lib/api'
import type { BookingRecord, CustomerAttachment, FleetSettings, FundRecord, Paginated, VehicleRecord } from '../types'
import { ConfirmDialog, RowActions, useToast } from '../components/Ui'
import { LocationPicker } from '../components/LocationPicker'

type Customer = { id: number; name: string; email?: string | null; phone?: string | null; address?: string | null }
type QuickAddCategory = 'license' | 'secondary_id' | 'ltms'
type Payment = { amount: string; notes: string; paid_at: string; fund_id: string }
type BookingForm = {
  vehicle_id: string; customer_id: string; pickup_at: string; return_at: string; destination: string
  rental_rate: string; delivery_address: string; delivery_latitude: string; delivery_longitude: string; delivery_distance_km: string; delivery_fee: string; return_location_mode: 'garage' | 'location'; return_address: string; return_latitude: string; return_longitude: string; return_distance_km: string; return_pickup_fee: string; payment_method: string; notes: string; fuel_charge: string; rfid_charge: string
  damage_fees: string; car_wash_fees: string; extension_fees: string; payments: Payment[]; status: string; status_reason: string
}

const emptyPayment = (): Payment => ({ amount: '', notes: '', paid_at: new Date().toISOString().slice(0, 10), fund_id: '' })
const emptyForm: BookingForm = { vehicle_id: '', customer_id: '', pickup_at: '', return_at: '', destination: '', rental_rate: '', delivery_address: '', delivery_latitude: '', delivery_longitude: '', delivery_distance_km: '', delivery_fee: '', return_location_mode: 'garage', return_address: '', return_latitude: '', return_longitude: '', return_distance_km: '', return_pickup_fee: '', payment_method: 'cash_on_pickup', notes: '', fuel_charge: '', rfid_charge: '', damage_fees: '', car_wash_fees: '', extension_fees: '', payments: [], status: 'pending', status_reason: '' }
const feeFields: Array<[keyof BookingForm, string]> = [['fuel_charge', 'Fuel charge'], ['rfid_charge', 'RFID charge'], ['damage_fees', 'Damage fees'], ['car_wash_fees', 'Car wash fees'], ['extension_fees', 'Extension fees']]
const statusTransitions: Record<string, string[]> = {
  pending: ['upcoming', 'cancelled', 'rejected'],
  upcoming: ['cancelled'],
  ongoing: ['complete'],
  complete: [],
  cancelled: [],
  rejected: [],
}
const statusLabel = (status: string) => status.charAt(0).toUpperCase() + status.slice(1)
const quickAddRequirements: Array<[QuickAddCategory, string, number]> = [['license', "Driver's license (front & back)", 2], ['secondary_id', 'Secondary ID', 1], ['ltms', 'LTMS portal photos', 1]]

function dateTimeLocalValue(value: string): string {
  const date = new Date(value)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function calendarDays(start: string, end: string): number {
  const startDate = new Date(start)
  const endDate = new Date(end)
  return Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / 86400000))
}

function bookingExtensionHours(start: string, end: string): number {
  return Math.ceil(((new Date(end).getTime() - new Date(start).getTime()) % 86400000) / 3600000)
}

function bookingDateTime(value: string): string {
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

function bookingDatePart(value: string): string {
  return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function bookingTimePart(value: string): string {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function rentalDurationLabel(start: string, end: string): string {
  const durationHours = Math.max(0, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 3600000))
  const days = Math.floor(durationHours / 24)
  const hours = durationHours % 24
  const parts = []
  if (days > 0) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`)
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`)
  return parts.join(' ') || '0 hours'
}

function isToday(value: string): boolean {
  const date = new Date(value)
  const today = new Date()
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate()
}

const apiOrigin = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api').replace(/\/api\/?$/, '')

function vehicleImageUrl(vehicle: VehicleRecord): string | null {
  const value = vehicle.images?.[0]?.url
  if (!value) return null
  return value.startsWith('http') ? value : `${apiOrigin}/storage/${value.replace(/^\/+/, '').replace(/^storage\//, '')}`
}

function vehicleLabel(vehicle: VehicleRecord): string {
  const name = vehicle.name ? `${vehicle.name} - ` : ''
  return `${name}${vehicle.brand} ${vehicle.model} (${vehicle.year})`
}

function SearchableSelect<T extends { id: number }>({
  value,
  options,
  placeholder,
  onChange,
  renderLabel,
  renderOption,
}: {
  value: string
  options: T[]
  placeholder: string
  onChange: (value: string) => void
  renderLabel: (option: T) => string
  renderOption?: (option: T, selected: boolean) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const selected = options.find(option => String(option.id) === value)
  const filtered = options.filter(option => renderLabel(option).toLowerCase().includes(query.toLowerCase()))

  useEffect(() => {
    if (!open) return
    const handleOutsidePointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
        setQuery('')
        const activeElement = document.activeElement as HTMLElement | null
        activeElement?.blur()
      }
    }
    document.addEventListener('pointerdown', handleOutsidePointer)
    return () => document.removeEventListener('pointerdown', handleOutsidePointer)
  }, [open])

  return <div className="relative" ref={containerRef}>
    <button type="button" className={`flex min-h-[43px] w-full items-center gap-3 border bg-white px-3 py-2.5 text-left text-sm ${open ? 'border-[#ff641f] ring-1 ring-[#ff641f]' : 'border-black/10'}`} onClick={() => setOpen(current => !current)}>
      {selected && renderOption ? <span className="min-w-0 flex-1">{renderOption(selected, true)}</span> : <span className={selected ? 'text-[#222]' : 'text-[#999]'}>{selected ? renderLabel(selected) : placeholder}</span>}
      <span className="text-[#777]">⌄</span>
    </button>
    {open && <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden border border-black/10 bg-white shadow-xl">
      <input autoFocus className="w-full border-b border-black/10 px-3 py-3 text-sm outline-none" placeholder="Start typing to search..." value={query} onChange={event => setQuery(event.target.value)} />
      <div className="max-h-64 overflow-y-auto p-1">
        {filtered.length === 0 ? <p className="px-3 py-5 text-sm text-[#777]">No matches found.</p> : filtered.map(option => <button type="button" className="flex w-full items-center rounded px-2 py-2 text-left hover:bg-[#f8f7f5]" key={option.id} onClick={() => { onChange(String(option.id)); setOpen(false); setQuery('') }}>{renderOption ? renderOption(option, String(option.id) === value) : renderLabel(option)}</button>)}
      </div>
    </div>}
  </div>
}

function VehicleOption({ vehicle, selected }: { vehicle: VehicleRecord; selected: boolean }) {
  const image = vehicleImageUrl(vehicle)
  return <span className="flex min-w-0 items-center gap-3">
    {image ? <img className="h-10 w-14 shrink-0 rounded object-contain" src={image} alt="" /> : <span className="h-10 w-14 shrink-0 rounded bg-black/5" />}
    <span className="min-w-0"><span className={`block truncate font-medium ${selected ? 'text-[#ff641f]' : 'text-[#222]'}`}>{vehicleLabel(vehicle)}</span><span className="block truncate text-xs text-[#888]">{vehicle.plate_number}</span></span>
  </span>
}

function CustomerOption({ customer, selected }: { customer: Customer; selected: boolean }) {
  return <span className={`block truncate ${selected ? 'text-[#ff641f]' : 'text-[#222]'}`}><span className="block truncate font-medium">{customer.name}</span>{(customer.email || customer.phone) && <span className="block truncate text-xs text-[#888]">{customer.email || customer.phone}</span>}</span>
}

function CustomerProfileTab({ customer }: { customer: BookingRecord['customer'] }) {
  if (!customer) return <div className="p-6 text-sm text-[#777]">No customer profile is attached to this booking.</div>
  const account = customer.user ?? customer
  const field = (label: string, value?: string | null) => <div><p className="text-xs uppercase text-[#888]">{label}</p><p className="mt-1 whitespace-pre-wrap font-medium">{value || '—'}</p></div>
  const groupedAttachments = (customer.attachments ?? []).reduce<Record<string, CustomerAttachment[]>>((groups, attachment) => {
    ;(groups[attachment.category] ??= []).push(attachment)
    return groups
  }, {})
  return <div className="space-y-6 p-6">
    <section><p className="text-xs uppercase tracking-widest text-[#ff641f]">Account information</p><h2 className="mt-1 text-xl font-semibold">{customer.name || account.name}</h2><div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{field('First name', account.first_name ?? customer.first_name)}{field('Middle name', account.middle_name ?? customer.middle_name)}{field('Last name', account.last_name ?? customer.last_name)}{field('Date of birth', account.date_of_birth ?? customer.date_of_birth ? new Date((account.date_of_birth ?? customer.date_of_birth) as string).toLocaleDateString() : null)}{field('Username', account.username ?? customer.username)}{field('Email', customer.email ?? account.email)}{field('Phone', customer.phone)}{field('Address', customer.address)}{field('License number', customer.license_number)}{field('License expiry', customer.license_expiry ? new Date(customer.license_expiry).toLocaleDateString() : null)}{field('Identification information', customer.identification_information)}{field('Notes', customer.notes)}</div></section>
    <section className="border-t border-black/10 pt-6"><div className="flex items-center justify-between gap-4"><div><p className="text-xs uppercase tracking-widest text-[#ff641f]">Submitted requirements</p><h2 className="mt-1 text-xl font-semibold">Identity documents</h2></div><span className="text-sm text-[#777]">{customer.attachments?.length ?? 0} file(s)</span></div>{Object.keys(groupedAttachments).length === 0 ? <p className="mt-5 text-sm text-[#777]">No requirements have been submitted.</p> : <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(groupedAttachments).map(([category, attachments]) => <div className="border border-black/10 p-4" key={category}><p className="text-sm font-semibold">{category.replaceAll('_', ' ')}</p><div className="mt-3 grid grid-cols-2 gap-3">{attachments.map(attachment => <a className="group block" href={attachment.url} target="_blank" rel="noreferrer" key={attachment.id}><img src={attachment.url} alt={`${category.replaceAll('_', ' ')} document`} className="h-32 w-full rounded border border-black/10 object-cover transition group-hover:opacity-75" /><span className="mt-2 block text-xs text-[#ff641f] group-hover:underline">Open document ↗</span></a>)}</div></div>)}</div>}</section>
  </div>
}

function RejectionNotice({ status, reason }: { status: string; reason?: string | null }) {
  const label = status === 'cancelled' ? 'Booking cancelled' : 'Booking rejected'
  return <div className="mt-6 border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p className="font-semibold">{label}</p><p className="mt-1">{reason || 'No reason was recorded.'}</p></div>
}

export default function BookingsPage() {
  const { showToast } = useToast()
  const [bookings, setBookings] = useState<BookingRecord[]>([])
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [funds, setFunds] = useState<FundRecord[]>([])
  const [fleetSettings, setFleetSettings] = useState<FleetSettings>({ reservation_fee: '0', reservation_fee_deductible: true, default_hour_extension_rate: '200', full_day_extension_threshold_hours: 12, late_return_grace_period_minutes: 60, default_delivery_rate_per_km: '0', garage_location_name: null, garage_location_address: null, garage_location_latitude: null, garage_location_longitude: null, terms_and_conditions: null, privacy_policy: null })
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [sort, setSort] = useState<'priority' | 'latest' | 'oldest'>('priority')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [routeCalculating, setRouteCalculating] = useState(false)
  const [routeError, setRouteError] = useState('')
  const [paymentsTouched, setPaymentsTouched] = useState(false)
  const [addCustomer, setAddCustomer] = useState(false)
  const [newCustomer, setNewCustomer] = useState({ first_name: '', middle_name: '', last_name: '', email: '', phone: '', address: '' })
  const [newCustomerFiles, setNewCustomerFiles] = useState<Record<QuickAddCategory, File[]>>({ license: [], secondary_id: [], ltms: [] })
  const [searchParams, setSearchParams] = useSearchParams()
  const [pendingStatusChange, setPendingStatusChange] = useState<{ booking: BookingRecord; nextStatus: string } | null>(null)
  const [selectedBooking, setSelectedBooking] = useState<BookingRecord | null>(null)
  const [showActions, setShowActions] = useState(false)
  const [detailTab, setDetailTab] = useState<'details' | 'payments' | 'customer'>('details')
  const [detailLoading, setDetailLoading] = useState(false)
  const [quickPaymentBooking, setQuickPaymentBooking] = useState<BookingRecord | null>(null)
  const [quickPayment, setQuickPayment] = useState({ amount: '', paid_at: new Date().toISOString().slice(0, 10), notes: '', fund_id: '' })
  const [quickPaymentSaving, setQuickPaymentSaving] = useState(false)
  const [invoiceGenerating, setInvoiceGenerating] = useState(false)

  const loadBookings = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ per_page: '100', sort })
    if (search.trim()) params.set('search', search.trim())
    if (filter) params.set('filter', filter)
    if (includeArchived) params.set('include_archived', '1')
    try {
      const result = await api.get<Paginated<BookingRecord>>(`/bookings?${params.toString()}`)
      setBookings(result.data.data)
      return result.data.data
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load bookings')
      throw e
    } finally {
      setLoading(false)
    }
  }, [filter, search, sort, includeArchived])
  useEffect(() => { const timer = window.setTimeout(loadBookings, 250); return () => window.clearTimeout(timer) }, [loadBookings])
  useEffect(() => {
    Promise.all([api.get<Paginated<VehicleRecord>>('/vehicles?per_page=100'), api.get<Paginated<Customer>>('/customers?per_page=100'), api.get<{ funds: FundRecord[] }>('/funds'), api.get<FleetSettings>('/fleet-settings')])
      .then(([vehicleResult, customerResult, fundResult, settingsResult]) => { setVehicles(vehicleResult.data.data); setCustomers(customerResult.data.data); setFunds(fundResult.data.funds); setFleetSettings(settingsResult.data) })
      .catch(e => setError(e instanceof Error ? e.message : 'Unable to load booking options'))
  }, [])

  const setField = (key: keyof BookingForm, value: string) => setForm(current => ({ ...current, [key]: value }))
  const openCreate = () => { setEditing(null); setForm(emptyForm); setRouteError(''); setPaymentsTouched(false); setAddCustomer(false); setShowForm(true) }
  const openDetails = useCallback(async (booking: BookingRecord) => {
    setSelectedBooking(booking); setDetailTab('details'); setShowActions(false); setDetailLoading(true)
    try {
      const result = await api.get<BookingRecord>(`/bookings/${booking.id}${includeArchived ? '?include_archived=1' : ''}`)
      setSelectedBooking(result.data)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to load booking details', 'error')
    } finally {
      setDetailLoading(false)
    }
  }, [showToast])
  const openDetailsById = useCallback(async (bookingId: number) => {
    setDetailTab('details'); setShowActions(false); setDetailLoading(true)
    try {
      const result = await api.get<BookingRecord>(`/bookings/${bookingId}${includeArchived ? '?include_archived=1' : ''}`)
      setSelectedBooking(result.data)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Unable to load booking details', 'error')
    } finally {
      setDetailLoading(false)
    }
  }, [showToast])
  const generateInvoice = useCallback(async (booking: BookingRecord) => {
    const invoiceWindow = window.open('', '_blank')
    if (!invoiceWindow) {
      showToast('Please allow pop-ups to open the invoice.', 'error')
      return
    }
    setInvoiceGenerating(true)
    try {
      const result = await api.get<string>(`/bookings/${booking.id}/invoice`, { responseType: 'text' })
      const url = URL.createObjectURL(new Blob([result.data], { type: 'text/html' }))
      invoiceWindow.location.href = url
      window.setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (error) {
      invoiceWindow.close()
      showToast(error instanceof Error ? error.message : 'Unable to generate invoice', 'error')
    } finally {
      setInvoiceGenerating(false)
    }
  }, [showToast])
  const openEdit = useCallback((booking: BookingRecord) => {
    setEditing(booking.id)
    setRouteError('')
    setPaymentsTouched(false)
    setForm({ ...emptyForm, vehicle_id: String(booking.vehicle?.id ?? ''), customer_id: String(booking.customer?.id ?? ''), pickup_at: dateTimeLocalValue(booking.pickup_at), return_at: dateTimeLocalValue(booking.return_at), destination: booking.destination ?? '', rental_rate: booking.rental_rate ?? '', delivery_address: booking.delivery_address ?? '', delivery_latitude: booking.delivery_latitude ?? '', delivery_longitude: booking.delivery_longitude ?? '', delivery_distance_km: booking.delivery_distance_km ?? '', delivery_fee: booking.delivery_fee ?? '', return_location_mode: booking.return_latitude && booking.return_longitude ? 'location' : 'garage', return_address: booking.return_address ?? '', return_latitude: booking.return_latitude ?? '', return_longitude: booking.return_longitude ?? '', return_distance_km: booking.return_distance_km ?? '', return_pickup_fee: booking.return_pickup_fee ?? '', payment_method: booking.payment_method ?? 'cash_on_pickup', notes: booking.notes ?? '', fuel_charge: booking.fuel_charge ?? '', rfid_charge: booking.rfid_charge ?? '', damage_fees: booking.damage_fees ?? '', car_wash_fees: booking.car_wash_fees ?? '', extension_fees: booking.extension_fees ?? '', payments: booking.payments?.map(payment => ({ amount: payment.amount, notes: payment.notes ?? '', paid_at: payment.paid_at.slice(0, 10), fund_id: payment.fund_id ? String(payment.fund_id) : '' })) ?? [], status: booking.status, status_reason: '' })
    setShowForm(true)
  }, [])

  useEffect(() => {
    const editId = Number(searchParams.get('edit'))
    const booking = bookings.find(item => item.id === editId)
    if (!booking || showForm) return
    const timer = window.setTimeout(() => {
      openEdit(booking)
      const nextParams = new URLSearchParams(searchParams)
      nextParams.delete('edit')
      setSearchParams(nextParams, { replace: true })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [bookings, openEdit, searchParams, setSearchParams, showForm])
  useEffect(() => {
    const bookingId = Number(searchParams.get('booking'))
    const booking = bookings.find(item => item.id === bookingId)
    if (bookingId <= 0 || selectedBooking || showForm) return
    const timer = window.setTimeout(() => {
      if (booking) void openDetails(booking)
      else void openDetailsById(bookingId)
      const nextParams = new URLSearchParams(searchParams)
      nextParams.delete('booking')
      setSearchParams(nextParams, { replace: true })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [bookings, openDetails, openDetailsById, searchParams, setSearchParams, selectedBooking, showForm])

  const saveCustomer = async () => {
    const payload = new FormData()
    Object.entries(newCustomer).forEach(([key, value]) => { if (value) payload.append(key, value) })
    let attachmentIndex = 0
    Object.entries(newCustomerFiles).forEach(([category, files]) => files.forEach(file => {
      payload.append(`attachments[${attachmentIndex}][category]`, category)
      payload.append(`attachments[${attachmentIndex}][file]`, file)
      attachmentIndex += 1
    }))
    const result = await api.post<Customer>('/customers', payload)
    setCustomers(current => [...current, result.data])
    setForm(current => ({ ...current, customer_id: String(result.data.id) }))
    setNewCustomer({ first_name: '', middle_name: '', last_name: '', email: '', phone: '', address: '' })
    setNewCustomerFiles({ license: [], secondary_id: [], ltms: [] })
    setAddCustomer(false)
  }

  const saveBooking = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    const numeric = (value: string) => value ? Number(value) : 0
    const bookingFields = Object.fromEntries(Object.entries(form).filter(([key]) => !['payments', 'status', 'status_reason'].includes(key)))
    const currentBooking = editing ? bookings.find(booking => booking.id === editing) : null
    if (currentBooking?.status === 'ongoing' && form.status === 'complete' && !form.status_reason.trim()) {
      showToast('Add return inspection notes before completing the rental.', 'error')
      return
    }
    const lifecycle = editing && currentBooking && form.status !== currentBooking.status ? { status: form.status, status_reason: form.status_reason.trim() || undefined } : {}
    const payload = { ...bookingFields, ...lifecycle, rental_rate: form.rental_rate ? Number(form.rental_rate) : null, delivery_latitude: form.delivery_latitude ? Number(form.delivery_latitude) : null, delivery_longitude: form.delivery_longitude ? Number(form.delivery_longitude) : null, return_latitude: form.return_latitude ? Number(form.return_latitude) : null, return_longitude: form.return_longitude ? Number(form.return_longitude) : null, ...(editing === null || paymentsTouched ? { payments: form.payments.filter(payment => payment.amount).map(payment => ({ ...payment, amount: numeric(payment.amount), fund_id: payment.fund_id ? Number(payment.fund_id) : null })) } : {}), ...Object.fromEntries(feeFields.map(([key]) => [key, numeric(form[key] as string)])) }
    try {
      if (editing) await api.patch(`/bookings/${editing}`, payload)
      else await api.post('/bookings', payload)
      setShowForm(false); loadBookings(); showToast(editing ? 'Booking updated successfully.' : 'Booking created successfully.', 'success')
    } catch (e) { showToast(e instanceof Error ? e.message : 'Unable to save booking', 'error') }
  }

  const updateStatus = async (booking: BookingRecord, nextStatus: string, reason?: string) => {
    try {
      const response = await api.patch<BookingRecord>(`/bookings/${booking.id}`, { status: nextStatus, ...(reason ? { status_reason: reason } : {}) })
      if (response.data.status !== nextStatus) throw new Error(`The server returned status "${response.data.status}" instead of "${nextStatus}".`)
      setSelectedBooking(current => current?.id === booking.id ? response.data : current)
      const refreshed = await loadBookings()
      const updated = refreshed.find(item => item.id === booking.id)
      if (updated?.status !== nextStatus) throw new Error(`The booking is still "${updated?.status ?? 'missing'}" after saving. Please refresh and try again.`)
      showToast('Booking status updated.', 'success')
    } catch (e) { showToast(e instanceof Error ? e.message : 'Unable to update booking', 'error') }
  }
  const requestStatusChange = (booking: BookingRecord, nextStatus: string) => {
    if (nextStatus === 'cancelled' || nextStatus === 'rejected') {
      setPendingStatusChange({ booking, nextStatus })
      return
    }
    void updateStatus(booking, nextStatus)
  }
  const openQuickPayment = (booking: BookingRecord) => { setQuickPaymentBooking(booking); setQuickPayment({ amount: '', paid_at: new Date().toISOString().slice(0, 10), notes: '', fund_id: '' }) }
  const saveQuickPayment = async (event: FormEvent) => {
    event.preventDefault()
    if (!quickPaymentBooking || !quickPayment.amount) return
    setQuickPaymentSaving(true)
    try {
      const payments = [...(quickPaymentBooking.payments ?? []).map(payment => ({ amount: Number(payment.amount), notes: payment.notes ?? '', paid_at: payment.paid_at, fund_id: payment.fund_id ?? null })), { amount: Number(quickPayment.amount), notes: quickPayment.notes || null, paid_at: quickPayment.paid_at, fund_id: quickPayment.fund_id ? Number(quickPayment.fund_id) : null }]
      await api.patch(`/bookings/${quickPaymentBooking.id}`, { payments })
      setQuickPaymentBooking(null)
      await loadBookings()
      showToast('Payment added successfully.', 'success')
    } catch (error) { showToast(error instanceof Error ? error.message : 'Unable to add payment', 'error') }
    finally { setQuickPaymentSaving(false) }
  }
  const requestSelectedStatus = (nextStatus: string) => {
    if (!selectedBooking) return
    requestStatusChange(selectedBooking, nextStatus)
    setShowActions(false)
  }
  const selectedVehicle = vehicles.find(vehicle => String(vehicle.id) === form.vehicle_id)
  const editingBooking = editing ? bookings.find(booking => booking.id === editing) : null
  const rentalDays = form.pickup_at && form.return_at ? calendarDays(form.pickup_at, form.return_at) : 0
  const durationMinutes = form.pickup_at && form.return_at ? Math.ceil((new Date(form.return_at).getTime() - new Date(form.pickup_at).getTime()) / 60000) : 0
  const extensionHours = Math.ceil(Math.max(0, (durationMinutes % (24 * 60)) - fleetSettings.late_return_grace_period_minutes) / 60)
  const hourlyRate = Number(selectedVehicle?.hour_extension_rate ?? fleetSettings.default_hour_extension_rate)
  const dailyRate = form.rental_rate ? Number(form.rental_rate) : Number(selectedVehicle?.daily_rate ?? 0)
  const extensionAmount = extensionHours === 0 ? 0 : extensionHours >= fleetSettings.full_day_extension_threshold_hours ? dailyRate : extensionHours * hourlyRate
  const subtotal = rentalDays * dailyRate + extensionAmount
  const optionalFees = feeFields.reduce((sum, [key]) => sum + Number(form[key] || 0), 0)
  const reservationFee = Number(fleetSettings.reservation_fee)
  const securityDeposit = Number(selectedVehicle?.security_deposit_fee ?? 0)
  const deliveryFee = Number(form.delivery_fee || 0)
  const returnPickupFee = Number(form.return_pickup_fee || 0)
  const formTotal = subtotal + optionalFees + deliveryFee + returnPickupFee + securityDeposit + (fleetSettings.reservation_fee_deductible ? 0 : reservationFee)
  const formPaid = form.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
  const formBalance = Math.max(0, formTotal - formPaid)

  useEffect(() => {
    const originLat = fleetSettings.garage_location_latitude
    const originLon = fleetSettings.garage_location_longitude
    const deliveryLat = Number(form.delivery_latitude)
    const deliveryLon = Number(form.delivery_longitude)
    const returnLat = Number(form.return_latitude)
    const returnLon = Number(form.return_longitude)
    const hasDelivery = form.delivery_latitude !== '' && form.delivery_longitude !== '' && Number.isFinite(deliveryLat) && Number.isFinite(deliveryLon)
    const hasReturn = form.return_latitude !== '' && form.return_longitude !== '' && Number.isFinite(returnLat) && Number.isFinite(returnLon)
    const clearBreakdown = () => setForm(current => ({ ...current, delivery_distance_km: '', delivery_fee: '', return_distance_km: '', return_pickup_fee: '' }))

    if (!hasDelivery && !hasReturn) {
      const resetTimer = window.setTimeout(() => { clearBreakdown(); setRouteCalculating(false); setRouteError('') }, 0)
      return () => window.clearTimeout(resetTimer)
    }
    if (originLat === null || originLon === null) {
      const errorTimer = window.setTimeout(() => { clearBreakdown(); setRouteCalculating(false); setRouteError('Delivery fees are unavailable because the garage location has not been configured.') }, 0)
      return () => window.clearTimeout(errorTimer)
    }

    let cancelled = false
    const routeDistance = async (latitude: number, longitude: number): Promise<number> => {
      const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${originLon},${originLat};${longitude},${latitude}?overview=false`)
      const data = await response.json() as { code?: string; routes?: Array<{ distance?: number }> }
      if (!response.ok || data.code !== 'Ok' || typeof data.routes?.[0]?.distance !== 'number') {
        throw new Error('Unable to calculate the route distance.')
      }
      return Math.round(data.routes[0].distance / 10) / 100
    }

    void Promise.resolve().then(() => {
      if (cancelled) return
      setRouteCalculating(true)
      setRouteError('')
    })
    void Promise.all([hasDelivery ? routeDistance(deliveryLat, deliveryLon) : Promise.resolve(null), hasReturn ? routeDistance(returnLat, returnLon) : Promise.resolve(null)])
      .then(([deliveryDistance, returnDistance]) => {
        if (cancelled) return
        const vehicleRate = selectedVehicle?.delivery_rate_per_km === null || selectedVehicle?.delivery_rate_per_km === undefined ? null : Number(selectedVehicle.delivery_rate_per_km)
        const rate = vehicleRate !== null && vehicleRate > 0 ? vehicleRate : Number(fleetSettings.default_delivery_rate_per_km)
        setForm(current => ({
          ...current,
          delivery_distance_km: deliveryDistance === null ? '' : String(deliveryDistance),
          delivery_fee: deliveryDistance === null ? '' : String(Math.round(deliveryDistance * rate * 100) / 100),
          return_distance_km: returnDistance === null ? '' : String(returnDistance),
          return_pickup_fee: returnDistance === null ? '' : String(Math.round(returnDistance * 2 * rate * 100) / 100),
        }))
      })
      .catch(error => {
        if (cancelled) return
        clearBreakdown()
        setRouteError(error instanceof Error ? error.message : 'Unable to calculate the route distance.')
      })
      .finally(() => { if (!cancelled) setRouteCalculating(false) })

    return () => { cancelled = true }
  }, [fleetSettings.default_delivery_rate_per_km, fleetSettings.garage_location_latitude, fleetSettings.garage_location_longitude, form.delivery_latitude, form.delivery_longitude, form.return_latitude, form.return_longitude, selectedVehicle])

  const updatePayment = (index: number, changes: Partial<Payment>) => {
    setPaymentsTouched(true)
    setForm(current => ({ ...current, payments: current.payments.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item) }))
  }
  return <><ConfirmDialog open={pendingStatusChange !== null} title={`${pendingStatusChange?.nextStatus === 'rejected' ? 'Reject' : 'Cancel'} booking?`} message={`This action is permanent. The booking cannot be restored after it is ${pendingStatusChange?.nextStatus ?? 'cancelled'}.`} confirmLabel={pendingStatusChange?.nextStatus === 'rejected' ? 'Reject booking' : 'Cancel booking'} onCancel={() => setPendingStatusChange(null)} onConfirm={reason => { if (pendingStatusChange) void updateStatus(pendingStatusChange.booking, pendingStatusChange.nextStatus, reason); setPendingStatusChange(null) }} />
  {quickPaymentBooking && <div className="fixed inset-0 z-[115] flex items-center justify-center bg-black/50 p-4"><form className="w-full max-w-md bg-white p-6 shadow-2xl" onSubmit={saveQuickPayment}><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Add payment</h2><button type="button" className="text-2xl text-[#777]" onClick={() => setQuickPaymentBooking(null)}>×</button></div><p className="mt-2 text-sm text-[#777]">{quickPaymentBooking.reference} · {quickPaymentBooking.customer?.name ?? 'Customer'}</p><label className="mt-5 block text-sm">Amount<input required min="0.01" step="0.01" type="number" className="mt-2 w-full border border-black/10 px-3 py-3" value={quickPayment.amount} onChange={event => setQuickPayment(current => ({ ...current, amount: event.target.value }))} /></label><label className="mt-4 block text-sm">Payment date<DateTimePicker value={quickPayment.paid_at} onChange={value => setQuickPayment(current => ({ ...current, paid_at: value }))} className="mt-2 w-full border border-black/10 px-3 py-3" /></label><label className="mt-4 block text-sm">Fund<select className="mt-2 w-full border border-black/10 px-3 py-3" value={quickPayment.fund_id} onChange={event => setQuickPayment(current => ({ ...current, fund_id: event.target.value }))}><option value="">No fund selected</option>{funds.map(fund => <option value={fund.id} key={fund.id}>{fund.name}</option>)}</select></label><label className="mt-4 block text-sm">Notes<textarea className="mt-2 w-full border border-black/10 px-3 py-3" rows={3} value={quickPayment.notes} onChange={event => setQuickPayment(current => ({ ...current, notes: event.target.value }))} /></label><div className="mt-6 flex justify-end gap-3"><button type="button" className="border border-black/10 px-4 py-2 text-sm" onClick={() => setQuickPaymentBooking(null)}>Cancel</button><button disabled={quickPaymentSaving} className="bg-[#ff641f] px-5 py-2 text-sm font-bold text-white disabled:opacity-50">{quickPaymentSaving ? 'Saving...' : 'Add payment'}</button></div></form></div>}
  {selectedBooking && <div className="fixed inset-x-0 bottom-0 top-20 z-[105] overflow-y-auto bg-[#f8f7f5] p-4 md:p-10 lg:left-[260px]"><div className="mx-auto max-w-6xl">
    <div className="flex items-start justify-between"><div><button className="text-sm text-[#777]" onClick={() => setSelectedBooking(null)}>← Bookings</button><p className="mt-5 text-xs uppercase tracking-widest text-[#ff641f]">Booking details</p><h1 className="mt-1 font-['Space_Grotesk'] text-3xl font-semibold">{selectedBooking.reference}</h1><p className="mt-1 text-sm text-[#777]">{statusLabel(selectedBooking.status)}</p></div><div className="relative"><button className="border border-black/10 bg-white px-5 py-3 text-sm font-semibold" onClick={() => setShowActions(value => !value)}>Actions</button>{showActions && <div className="absolute right-0 z-10 mt-2 w-52 border border-black/10 bg-white p-1 shadow-xl"><button disabled={invoiceGenerating} className="block w-full px-3 py-2 text-left text-sm hover:bg-[#f8f7f5] disabled:opacity-50" onClick={() => { void generateInvoice(selectedBooking); setShowActions(false) }}>{invoiceGenerating ? 'Generating invoice...' : 'Generate invoice'}</button>{!['cancelled', 'rejected', 'complete'].includes(selectedBooking.status) && <>    <button className="block w-full px-3 py-2 text-left text-sm hover:bg-[#f8f7f5]" onClick={() => { openQuickPayment(selectedBooking); setShowActions(false) }}>Add payment</button><button className="block w-full px-3 py-2 text-left text-sm hover:bg-[#f8f7f5]" onClick={() => { openEdit(selectedBooking); setSelectedBooking(null); setShowActions(false) }}>Edit booking</button></>}{selectedBooking.status === 'pending' && <button className="block w-full px-3 py-2 text-left text-sm hover:bg-[#f8f7f5]" onClick={() => { requestSelectedStatus('upcoming'); setShowActions(false) }}>Accept booking</button>}<button className="block w-full px-3 py-2 text-left text-sm hover:bg-[#f8f7f5]" onClick={() => { showToast('Contract preview will be available in a future update.', 'info'); setShowActions(false) }}>Contract preview</button>{statusTransitions[selectedBooking.status]?.includes('cancelled') && <button className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50" onClick={() => requestSelectedStatus('cancelled')}>Cancel booking</button>}{selectedBooking.status === 'pending' && <button className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50" onClick={() => requestSelectedStatus('rejected')}>Reject booking</button>}</div>}</div></div>
    {['rejected', 'cancelled'].includes(selectedBooking.status) && <RejectionNotice status={selectedBooking.status} reason={selectedBooking.status_reason ?? selectedBooking.statusHistory?.find(history => history.to_status === selectedBooking.status)?.reason ?? selectedBooking.status_history?.find(history => history.to_status === selectedBooking.status)?.reason} />}
    <div className="mt-8 border border-black/10 bg-white"><div className="flex flex-wrap border-b border-black/10"><button className={`px-5 py-4 text-sm font-semibold ${detailTab === 'details' ? 'bg-[#151515] text-white' : 'text-[#777]'}`} onClick={() => setDetailTab('details')}>Booking Details</button><button className={`px-5 py-4 text-sm font-semibold ${detailTab === 'payments' ? 'bg-[#151515] text-white' : 'text-[#777]'}`} onClick={() => setDetailTab('payments')}>Payments</button><button className={`px-5 py-4 text-sm font-semibold ${detailTab === 'customer' ? 'bg-[#151515] text-white' : 'text-[#777]'}`} onClick={() => setDetailTab('customer')}>Customer Profile</button></div>
    {detailLoading ? <div className="flex min-h-64 items-center justify-center p-6 text-sm text-[#777]"><span className="mr-3 h-5 w-5 animate-spin rounded-full border-2 border-black/10 border-t-[#ff641f]" />Loading booking details...</div> : detailTab === 'details' ? <><div className="grid gap-6 p-6 lg:grid-cols-[280px_1fr]"><div className="border border-black/10 bg-[#f8f7f5] p-5"><p className="text-xs uppercase tracking-widest text-[#ff641f]">Assigned fleet</p><h2 className="mt-2 text-xl font-semibold">{selectedBooking.vehicle?.name || `${selectedBooking.vehicle?.brand ?? ''} ${selectedBooking.vehicle?.model ?? ''}`}</h2><p className="mt-2 text-sm text-[#777]">{selectedBooking.vehicle?.plate_number}</p><p className="mt-8 text-sm text-[#777]">{selectedBooking.vehicle?.year} · {selectedBooking.vehicle?.color}</p></div><div className="border border-black/10 p-6"><div className="grid gap-6 md:grid-cols-3"><div><p className="text-xs uppercase text-[#888]">Renter / client</p><p className="mt-2 font-semibold">{selectedBooking.customer?.name ?? '—'}</p></div><div><p className="text-xs uppercase text-[#888]">Departure / pickup</p><p className="mt-2 font-semibold">{bookingDateTime(selectedBooking.pickup_at)}</p></div><div><p className="text-xs uppercase text-[#888]">Arrival / return</p><p className="mt-2 font-semibold">{bookingDateTime(selectedBooking.return_at)}</p></div></div><p className="mt-8 text-sm text-[#777]">Destination</p>    <p className="mt-1 font-semibold">{selectedBooking.destination || '—'}</p>{(selectedBooking.delivery_address || Number(selectedBooking.delivery_fee ?? 0) > 0) && <><p className="mt-4 text-sm text-[#777]">Delivery location</p>    <p className="mt-1 font-semibold">{selectedBooking.delivery_address === 'Pinned location' && selectedBooking.delivery_latitude !== null && selectedBooking.delivery_longitude !== null ? `Pinned coordinates: ${Number(selectedBooking.delivery_latitude).toFixed(6)}, ${Number(selectedBooking.delivery_longitude).toFixed(6)}` : selectedBooking.delivery_address || 'Location pinned on map'}</p></>}    <p className="mt-4 text-sm font-semibold">{Number(selectedBooking.delivery_fee ?? 0) > 0 ? `    Delivery fee (${Number(selectedBooking.delivery_rate_per_km ?? 0).toFixed(2)} x ${Number(selectedBooking.delivery_distance_km ?? 0).toFixed(2)} km): ₱${Number(selectedBooking.delivery_fee).toLocaleString()}` : ''}</p><p className="mt-2 text-sm font-semibold">{Number(selectedBooking.return_pickup_fee ?? 0) > 0 ? `Return pickup fee (${Number(selectedBooking.return_distance_km ?? 0).toFixed(2)} km × 2): ₱${Number(selectedBooking.return_pickup_fee).toLocaleString()}` : ''}</p></div></div><div className="border-t border-black/10 p-6"><div className="flex items-start justify-between"><div><p className="text-xs uppercase tracking-widest text-[#ff641f]">Financial ledger</p><h2 className="mt-1 text-xl font-semibold">Billing & adjustments</h2></div><div className="text-right"><p className="text-xs text-[#888]">Balance</p><p className="text-2xl font-bold text-[#ff641f]">₱{Number(selectedBooking.balance ?? 0).toLocaleString()}</p></div></div><div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div>    <p className="text-xs text-[#888]">Rental fees (₱{Number(selectedBooking.rental_rate ?? selectedBooking.vehicle?.daily_rate ?? 0).toLocaleString()} x {calendarDays(selectedBooking.pickup_at, selectedBooking.return_at)} day{calendarDays(selectedBooking.pickup_at, selectedBooking.return_at) === 1 ? "" : "s"})</p><p className="mt-1 font-semibold">?{Number(selectedBooking.rental_amount ?? 0).toLocaleString()}</p></div>{[['Fuel charge', selectedBooking.fuel_charge], ['RFID charge', selectedBooking.rfid_charge], ['Damage fees', selectedBooking.damage_fees], ['Car wash fees', selectedBooking.car_wash_fees]].map(([label, value]) => <div key={label as string}><p className="text-xs text-[#888]">{label as string}</p><p className="mt-1 font-semibold">₱{Number(value ?? 0).toLocaleString()}</p></div>)}<div><p className="text-xs text-[#888]">Extension fees ({bookingExtensionHours(selectedBooking.pickup_at, selectedBooking.return_at)} hour{bookingExtensionHours(selectedBooking.pickup_at, selectedBooking.return_at) === 1 ? "" : "s"})</p><p className="mt-1 font-semibold">?{Number(selectedBooking.extension_fees ?? 0).toLocaleString()}</p></div>    <div><p className="text-xs text-[#888]">Security deposit</p><p className="mt-1 font-semibold">₱{Number(selectedBooking.vehicle?.security_deposit_fee ?? 0).toLocaleString()}</p></div>    <div><p className="text-xs text-[#888]">Delivery fee</p><p className="mt-1 font-semibold">₱{Number(selectedBooking.delivery_fee ?? 0).toLocaleString()}</p></div><div><p className="text-xs text-[#888]">Return pickup fee</p><p className="mt-1 font-semibold">₱{Number(selectedBooking.return_pickup_fee ?? 0).toLocaleString()}</p></div><div><p className="text-xs text-[#888]">Total amount</p><p className="mt-1 font-semibold">₱{Number(selectedBooking.total_amount).toLocaleString()}</p></div><div><p className="text-xs text-[#888]">Payments</p><p className="mt-1 font-semibold">₱{(Number(selectedBooking.total_amount) - Number(selectedBooking.balance ?? 0)).toLocaleString()}</p></div></div></div></> : detailTab === 'payments' ? <div className="p-6"><div className="grid gap-4 md:grid-cols-3"><div className="border border-black/10 p-5"><p className="text-sm text-[#777]">Total commitment</p><p className="mt-2 text-2xl font-bold">₱{Number(selectedBooking.total_amount).toLocaleString()}</p><p className="mt-2 text-xs text-[#888]">Gross amount</p></div><div className="border border-emerald-200 bg-emerald-50 p-5"><p className="text-sm text-emerald-700">Total remitted</p><p className="mt-2 text-2xl font-bold text-emerald-600">₱{(Number(selectedBooking.total_amount) - Number(selectedBooking.balance ?? 0)).toLocaleString()}</p><p className="mt-2 text-xs text-emerald-700">Recorded payments</p></div><div className="border border-red-200 bg-red-50 p-5"><p className="text-sm text-red-700">Outstanding payables</p><p className="mt-2 text-2xl font-bold text-red-600">₱{Number(selectedBooking.balance ?? 0).toLocaleString()}</p><p className="mt-2 text-xs text-red-700">Payment pending</p></div></div><div className="mt-6 border border-black/10"><div className="flex items-center justify-between border-b border-black/10 p-5"><h2 className="font-semibold">Transaction history</h2><span className="text-sm text-[#777]">{selectedBooking.payments?.length ?? 0} record(s)</span></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-black/10 text-xs uppercase text-[#888]"><tr><th className="p-4">Fund source</th><th className="p-4">Settled amount</th><th className="p-4">Posting date</th><th className="p-4">Internal notes</th></tr></thead><tbody>{selectedBooking.payments?.map(payment => <tr className="border-b border-black/[.06]" key={payment.id}><td className="p-4"><span className="rounded-full border border-[#ff641f] px-3 py-1 text-xs text-[#ff641f]">Income</span></td><td className="p-4 font-semibold">₱{Number(payment.amount).toLocaleString()}</td><td className="p-4">{new Date(payment.paid_at).toLocaleDateString()}</td><td className="p-4 text-[#777]">{payment.notes || '—'}</td></tr>)}</tbody></table></div></div></div> : <CustomerProfileTab customer={selectedBooking.customer} />}
    </div>
  </div></div>}
  <AdminShell title="Booking management"><div className="mt-8 border border-black/10 bg-white p-4 md:p-6">
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><p className="text-sm text-[#777]">Create, update, and track rental bookings and balances.</p><button className="bg-[#ff641f] px-5 py-3 text-sm font-bold text-white" onClick={openCreate}>+ Add booking</button></div>
    {showForm && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4"><form className="max-h-[85vh] w-full max-w-[64rem] overflow-y-auto bg-white p-6 shadow-2xl" onSubmit={saveBooking}><div className="flex items-center justify-between"><h2 className="font-['Space_Grotesk'] text-2xl font-semibold">{editing ? 'Edit booking' : 'Add booking'}</h2><button type="button" className="text-2xl text-[#777]" onClick={() => setShowForm(false)}>×</button></div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="text-xs text-[#777]">Vehicle<span className="mt-2 block"><SearchableSelect value={form.vehicle_id} options={vehicles} placeholder="Select vehicle" onChange={value => setField('vehicle_id', value)} renderLabel={vehicleLabel} renderOption={(vehicle, selected) => <VehicleOption vehicle={vehicle} selected={selected} />} /></span></label>
        <label className="text-xs text-[#777]">Customer<div className="mt-2 flex gap-2"><span className="min-w-0 flex-1"><SearchableSelect value={form.customer_id} options={customers} placeholder="Select customer" onChange={value => setField('customer_id', value)} renderLabel={customer => customer.name} renderOption={(customer, selected) => <CustomerOption customer={customer} selected={selected} />} /></span><button type="button" className="border border-[#ff641f] px-3 text-[#ff641f]" onClick={() => setAddCustomer(value => !value)}>+ Add</button></div></label>
        {addCustomer && <div className="border border-orange-200 bg-orange-50 p-4 md:col-span-2"><p className="text-sm font-semibold">New customer</p><div className="mt-3 grid gap-3 md:grid-cols-2">{[['first_name', 'First Name', true], ['middle_name', 'Middle Name', false], ['last_name', 'Last Name', true], ['email', 'Email (optional)', false], ['phone', 'Phone (optional)', false], ['address', 'Address (optional)', false]].map(([key, label, required]) => <label className="text-xs text-[#777]" key={key as string}>{label as string}<input className="mt-1 w-full border border-black/10 bg-white px-3 py-2 text-sm" type={key === 'email' ? 'email' : 'text'} required={required as boolean} value={newCustomer[key as keyof typeof newCustomer]} onChange={e => setNewCustomer({ ...newCustomer, [key as keyof typeof newCustomer]: e.target.value })} /></label>)}</div><div className="mt-5 border-t border-orange-200 pt-4"><p className="text-sm font-semibold">Booking requirements <span className="font-normal text-[#777]">(optional)</span></p><p className="mt-1 text-xs text-[#777]">Attach clear image files now, or upload them later from the customer profile.</p><div className="mt-3 grid gap-3 md:grid-cols-3">{quickAddRequirements.map(([category, label, limit]) => <label className="text-xs text-[#777]" key={category}>{label}<input className="mt-1 w-full border border-black/10 bg-white px-3 py-2 text-xs" type="file" accept="image/*" multiple={limit > 1} onChange={event => setNewCustomerFiles(current => ({ ...current, [category]: Array.from(event.target.files ?? []).slice(0, limit) }))} /></label>)}</div></div><button type="button" className="mt-3 bg-[#151515] px-4 py-2 text-xs font-bold text-white" onClick={() => saveCustomer().then(() => showToast('Customer added successfully.', 'success')).catch(e => showToast(e instanceof Error ? e.message : 'Unable to add customer', 'error'))}>Save customer</button></div>}
        <label className="text-xs text-[#777]">Start date & time<DateTimePicker required mode="datetime" value={form.pickup_at} onChange={value => setField('pickup_at', value)} className="mt-2 w-full border border-black/10 px-3 py-2.5 text-sm" /></label>
        <label className="text-xs text-[#777]">End date & time<DateTimePicker required mode="datetime" value={form.return_at} onChange={value => setField('return_at', value)} className="mt-2 w-full border border-black/10 px-3 py-2.5 text-sm" /></label>
        <label className="text-xs text-[#777]">Destination<input className="mt-2 w-full border border-black/10 px-3 py-2.5 text-sm" required value={form.destination} onChange={e => setField('destination', e.target.value)} /></label>
        <label className="text-xs text-[#777]">Rental rate per day (optional)<input className="mt-2 w-full border border-black/10 px-3 py-2.5 text-sm" type="number" min="0" step="0.01" placeholder={selectedVehicle ? `Vehicle rate: ₱${Number(selectedVehicle.daily_rate).toLocaleString()}` : 'Uses vehicle rate'} value={form.rental_rate} onChange={e => setField('rental_rate', e.target.value)} /><span className="mt-1 block text-[11px] text-[#888]">Leave blank to use the vehicle’s base rate.</span></label>
        <fieldset className="md:col-span-2"><legend className="text-xs text-[#777]">Payment / handoff</legend><div className="mt-2 grid gap-3 sm:grid-cols-2"><label className="border p-3 text-sm"><input type="radio" name="admin-payment-method" value="cash_on_pickup" checked={form.payment_method === 'cash_on_pickup'} onChange={() => setForm(current => ({ ...current, payment_method: 'cash_on_pickup', delivery_address: '', delivery_latitude: '', delivery_longitude: '' }))} /> <span className="ml-2 font-semibold">Pick up at CL CarHub</span></label><label className="border p-3 text-sm"><input type="radio" name="admin-payment-method" value="cash_on_delivery" checked={form.payment_method === 'cash_on_delivery'} onChange={() => setForm(current => ({ ...current, payment_method: 'cash_on_delivery' }))} /> <span className="ml-2 font-semibold">Deliver to customer</span></label></div></fieldset>
        {form.payment_method === 'cash_on_delivery' && <LocationPicker label="Delivery location (optional)" value={{ address: form.delivery_address, latitude: form.delivery_latitude ? Number(form.delivery_latitude) : null, longitude: form.delivery_longitude ? Number(form.delivery_longitude) : null }} onChange={location => setForm(current => ({ ...current, delivery_address: location.address, delivery_latitude: location.latitude === null ? '' : String(location.latitude), delivery_longitude: location.longitude === null ? '' : String(location.longitude) }))} />}
        <fieldset className="md:col-span-2"><legend className="text-xs text-[#777]">Return location</legend><div className="mt-2 flex gap-3 text-sm"><label><input type="radio" checked={form.return_location_mode === 'garage'} onChange={() => setForm(current => ({ ...current, return_location_mode: 'garage', return_address: '', return_latitude: '', return_longitude: '' }))} /> <span className="ml-1">Return at CL CarHub</span></label><label><input type="radio" checked={form.return_location_mode === 'location'} onChange={() => setForm(current => ({ ...current, return_location_mode: 'location' }))} /> <span className="ml-1">Choose location</span></label></div></fieldset>
        {form.return_location_mode === 'location' && <LocationPicker label="Return pickup location" value={{ address: form.return_address, latitude: form.return_latitude ? Number(form.return_latitude) : null, longitude: form.return_longitude ? Number(form.return_longitude) : null }} onChange={location => setForm(current => ({ ...current, return_address: location.address, return_latitude: location.latitude === null ? '' : String(location.latitude), return_longitude: location.longitude === null ? '' : String(location.longitude) }))} />}
        {form.return_location_mode === 'location' && form.payment_method === 'cash_on_delivery' && form.delivery_address && <button type="button" className="text-left text-xs font-semibold text-[#ff641f] md:col-span-2" onClick={() => setForm(current => ({ ...current, return_address: current.delivery_address, return_latitude: current.delivery_latitude, return_longitude: current.delivery_longitude }))}>Use delivery location as return pickup</button>}
        {(form.delivery_latitude && form.delivery_longitude || form.return_latitude && form.return_longitude) && <div className="md:col-span-2 border border-black/10 bg-[#f8f7f5] p-4 text-sm"><p className="font-semibold">Location charges</p>{routeCalculating ? <p className="mt-2 text-[#777]">Calculating route distances...</p> : routeError ? <p className="mt-2 text-red-600">{routeError}</p> : <div className="mt-2 space-y-1 text-[#555]">{form.delivery_distance_km && <p>Delivery: {Number(form.delivery_distance_km).toFixed(2)} km · ₱{Number(form.delivery_fee).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>}{form.return_distance_km && <p>Return pickup: {Number(form.return_distance_km).toFixed(2)} km · ₱{Number(form.return_pickup_fee).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>}{!form.delivery_distance_km && !form.return_distance_km && <p>Route distance is not available.</p>}</div>}</div>}
        <label className="text-xs text-[#777] md:col-span-2">Remarks<textarea className="mt-2 min-h-24 w-full border border-black/10 px-3 py-2.5 text-sm" value={form.notes} onChange={e => setField('notes', e.target.value)} /></label>
      </div>
      {editing && <div className="mt-6 border-t border-black/10 pt-5"><h3 className="font-semibold">{editingBooking?.status === 'ongoing' ? 'Return processing' : 'Additional charges'}</h3><p className="mt-1 text-sm text-[#777]">{editingBooking?.status === 'ongoing' ? 'Record the vehicle inspection, final charges, and payment before completing this rental.' : 'Adjust charges associated with this booking.'}</p><div className="mt-3 grid gap-3 md:grid-cols-3">{feeFields.map(([key, label]) => <label className="text-xs text-[#777]" key={key}>{label}<input className="mt-1 w-full border border-black/10 px-3 py-2 text-sm" type="number" min="0" step="0.01" value={form[key] as string} onChange={e => setField(key, e.target.value)} /></label>)}</div>{editingBooking?.status === 'ongoing' && <div className="mt-4 grid gap-3 md:grid-cols-2"><label className="text-xs text-[#777]">Return notes<textarea className="mt-1 min-h-20 w-full border border-black/10 px-3 py-2 text-sm" value={form.status_reason} onChange={e => setField('status_reason', e.target.value)} placeholder="Describe the return inspection and condition." required={form.status === 'complete'} /></label><div className="border border-orange-200 bg-orange-50 p-4 text-sm text-[#6b3418]"><p className="font-semibold">Complete after inspection</p><p className="mt-1">Set the rental to complete after confirming the vehicle condition and collecting any remaining balance.</p><button type="button" className="mt-3 bg-[#ff641f] px-4 py-2 text-sm font-bold text-white" onClick={() => setField('status', 'complete')}>Mark ready to complete</button></div></div>}{form.status === 'complete' && <p className="mt-3 text-sm font-semibold text-emerald-700">This rental will be completed when you save.</p>}</div>}
      {editing && <div className="mt-6 border-t border-black/10 pt-5"><h3 className="font-semibold">Status history</h3><div className="mt-3 space-y-3">{(bookings.find(booking => booking.id === editing)?.statusHistory ?? []).length === 0 ? <p className="text-sm text-[#777]">No status changes recorded.</p> : bookings.find(booking => booking.id === editing)?.statusHistory?.map(history => <div className="border-l-2 border-black/10 pl-3 text-sm" key={history.id}><p className="font-medium">{history.from_status ?? 'Created'} → {history.to_status}</p><p className="text-xs text-[#777]">{new Date(history.created_at).toLocaleString()} · {history.user?.name ?? 'System'}</p>{history.reason && <p className="mt-1 text-xs text-[#555]">Reason: {history.reason}</p>}</div>)}</div></div>}
      <div className="mt-6 border-t border-black/10 pt-5"><div className="flex items-center justify-between"><h3 className="font-semibold">Booking payments</h3><button type="button" className="text-sm text-[#ff641f]" onClick={() => { setPaymentsTouched(true); setForm(current => ({ ...current, payments: [...current.payments, emptyPayment()] })) }}>+ Add payment</button></div>{form.payments.map((payment, index) => <div className="mt-3 grid gap-3 border border-black/10 p-3 md:grid-cols-[1fr_1.5fr_1fr_1fr_auto]" key={index}><input className="border border-black/10 px-3 py-2 text-sm" type="number" min="0" step="0.01" placeholder="Amount" value={payment.amount} onChange={e => updatePayment(index, { amount: e.target.value })} /><select className="border border-black/10 px-3 py-2 text-sm" value={payment.fund_id} onChange={e => updatePayment(index, { fund_id: e.target.value })}><option value="">Fund (optional)</option>{funds.map(fund => <option value={fund.id} key={fund.id}>{fund.name}</option>)}</select><input className="border border-black/10 px-3 py-2 text-sm" placeholder="Payment note" value={payment.notes} onChange={e => updatePayment(index, { notes: e.target.value })} /><DateTimePicker value={payment.paid_at} onChange={value => updatePayment(index, { paid_at: value })} className="border border-black/10 px-3 py-2 text-sm" placeholder="Payment date" /><button type="button" className="text-red-600" onClick={() => { setPaymentsTouched(true); setForm(current => ({ ...current, payments: current.payments.filter((_, itemIndex) => itemIndex !== index) })) }}>Remove</button></div>)}</div>
      <div className="mt-6 border-t border-black/10 pt-5"><h3 className="font-semibold">Receipt summary</h3><div className="mt-3 max-w-md space-y-2 text-sm"><div className="flex justify-between"><span className="text-[#777]">Rental fees ({`₱${dailyRate.toLocaleString()} × ${rentalDays} day${rentalDays === 1 ? '' : 's'}`})</span><span>₱{(rentalDays * dailyRate).toLocaleString()}</span></div>{extensionHours > 0 && <div className="flex justify-between"><span className="text-[#777]">Extension fees ({extensionHours} hour{extensionHours === 1 ? '' : 's'})</span><span>₱{extensionAmount.toLocaleString()}</span></div>}      {feeFields.map(([key, label]) => Number(form[key] || 0) > 0 && <div className="flex justify-between" key={key}><span className="text-[#777]">{label}</span><span>₱{Number(form[key]).toLocaleString()}</span></div>)}      {deliveryFee > 0 && <div className="flex justify-between"><span className="text-[#777]">Delivery fee</span><span>₱{deliveryFee.toLocaleString()}</span></div>}{returnPickupFee > 0 && <div className="flex justify-between"><span className="text-[#777]">Return pickup fee ({Number(form.return_distance_km || 0).toFixed(2)} km × 2)</span><span>₱{returnPickupFee.toLocaleString()}</span></div>}{reservationFee > 0 && <div className="flex justify-between"><span className="text-[#777]">Reservation fee</span><span>₱{reservationFee.toLocaleString()}</span></div>}{securityDeposit > 0 && <div className="flex justify-between"><span className="text-[#777]">Security deposit</span><span>₱{securityDeposit.toLocaleString()}</span></div>}<div className="flex justify-between border-t border-black/10 pt-2 font-semibold"><span>Total</span><span>₱{formTotal.toLocaleString()}</span></div><div className="flex justify-between"><span className="text-[#777]">Payments</span><span>- ₱{formPaid.toLocaleString()}</span></div><div className="flex justify-between border-t border-black/10 pt-2 text-base font-bold text-[#ff641f]"><span>Remaining balance</span><span>₱{formBalance.toLocaleString()}</span></div></div></div>
      <div className="mt-6 flex justify-end gap-3"><button type="button" className="border border-black/10 px-4 py-2 text-sm" onClick={() => setShowForm(false)}>Cancel</button><button className="bg-[#151515] px-5 py-2 text-sm font-bold text-white">{form.status === 'complete' && editing ? 'Save and complete rental' : 'Save booking'}</button></div>
    </form></div>}
    {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    <div className="mt-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_140px]">
      <input className="w-full border border-black/10 bg-white px-3 py-2.5 text-sm" placeholder="Search reference, customer, vehicle, or plate..." value={search} onChange={event => setSearch(event.target.value)} />
      <select className="w-full border border-black/10 bg-white px-3 py-2.5 text-sm" value={filter} onChange={event => setFilter(event.target.value)}>
        <option value="">All bookings</option><option value="pending">Pending</option><option value="upcoming">Upcoming</option><option value="ongoing">Ongoing</option><option value="complete">Complete</option><option value="rejected">Rejected</option><option value="cancelled">Cancelled</option>
      </select>
      <select className="w-full border border-black/10 bg-white px-3 py-2.5 text-sm" value={sort} onChange={event => setSort(event.target.value as 'priority' | 'latest' | 'oldest')}><option value="priority">Priority &amp; closest departure</option><option value="latest">Latest departure</option><option value="oldest">Oldest departure</option></select>
      <label className="flex items-center gap-2 text-xs text-[#777] md:col-span-3"><input type="checkbox" checked={includeArchived} onChange={event => setIncludeArchived(event.target.checked)} /> Show archived customer bookings</label>
    </div>
    <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="border-b border-black/10 text-[10px] uppercase tracking-widest text-[#888]"><tr><th className="pb-3">Reference</th><th className="pb-3">Customer</th><th className="pb-3">Vehicle</th><th className="pb-3">Dates</th><th className="pb-3">Balance</th><th className="pb-3">Status</th><th /></tr></thead><tbody>{loading ? <tr><td className="py-8 text-[#888]" colSpan={7}>Loading bookings...</td></tr> : bookings.map(booking => { const isPending = booking.status === 'pending'; const isTerminal = ['cancelled', 'rejected', 'complete'].includes(booking.status); const rowClass = `${isPending ? 'border-b border-black/[.06] bg-yellow-100/70' : booking.status === 'rejected' ? 'border-b border-red-200 bg-red-100/60 text-red-900 opacity-75' : booking.status === 'cancelled' ? 'border-b border-black/[.06] bg-gray-100 text-gray-500 opacity-75' : 'border-b border-black/[.06]'} cursor-pointer transition hover:bg-orange-50`; return <tr className={rowClass} key={booking.id} onClick={() => openDetails(booking)}><td className="py-4 font-semibold text-[#ff641f]">{booking.reference}</td><td className="py-4">{booking.customer?.name ?? '—'}</td><td className="py-4 text-[#777]">{booking.vehicle ? (booking.vehicle.name || `${booking.vehicle.brand} ${booking.vehicle.model}`) : '—'}</td><td className="py-4 text-xs"><div className="flex items-start gap-2"><div><span className={`block ${isToday(booking.pickup_at) ? 'font-bold text-[#ff641f]' : 'text-[#777]'}`}>Departure: {bookingDatePart(booking.pickup_at)} {bookingTimePart(booking.pickup_at)}</span><span className={`mt-1 block ${isToday(booking.return_at) ? 'font-bold text-[#ff641f]' : 'text-[#777]'}`}>Return: {bookingDatePart(booking.return_at)} {bookingTimePart(booking.return_at)}</span></div><span className="whitespace-nowrap rounded-full bg-orange-50 px-2 py-1 text-[10px] font-semibold text-[#d94f12]">{rentalDurationLabel(booking.pickup_at, booking.return_at)}</span></div></td><td className="py-4">₱{Number(booking.balance ?? 0).toLocaleString()}</td><td className="py-4"><span className="rounded-full bg-orange-50 px-2 py-1 text-xs font-semibold text-[#d94f12]">{statusLabel(booking.status)}</span></td><td className="py-4 text-right" onClick={event => event.stopPropagation()}><RowActions actions={[{ label: 'View Details', onClick: () => openDetails(booking) }, ...(booking.status === 'pending' ? [{ label: 'Accept booking', onClick: () => requestStatusChange(booking, 'upcoming') }, { label: 'Reject booking', onClick: () => requestStatusChange(booking, 'rejected') }] : []), ...(!isTerminal ? [{ label: 'Edit', onClick: () => openEdit(booking) }, { label: 'Add payment', onClick: () => openQuickPayment(booking) }] : []), ...(['pending', 'upcoming'].includes(booking.status) ? [{ label: 'Cancel booking', onClick: () => requestStatusChange(booking, 'cancelled'), danger: true }] : [])]} /></td></tr> })}</tbody></table></div>
  </div></AdminShell></>
}
