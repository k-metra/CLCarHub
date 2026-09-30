import { useEffect, useMemo, useState } from 'react'
import { AdminShell } from '../components/AdminShell'
import api from '../lib/api'
import type { BookingRecord, Paginated } from '../types'
import { Link } from 'react-router-dom'
import { Skeleton } from '../components/Ui'

const apiOrigin = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api').replace(/\/api\/?$/, '')
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function vehicleName(booking: BookingRecord): string {
  return booking.vehicle?.name || (booking.vehicle ? `${booking.vehicle.brand} ${booking.vehicle.model}` : 'Vehicle')
}

function imageUrl(booking: BookingRecord): string | null {
  const value = booking.vehicle?.images?.[0]?.url
  if (!value) return null
  return value.startsWith('http') ? value : `${apiOrigin}/storage/${value.replace(/^\/+/, '').replace(/^storage\//, '')}`
}

function bookingDate(value: string): string {
  const date = new Date(value)
  return date.toLocaleDateString()
}

function startOfWeek(date: Date): Date {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  result.setDate(result.getDate() - result.getDay())
  return result
}

function sameDay(left: Date, right: Date): boolean {
  return left.toDateString() === right.toDateString()
}

function overlapsDay(booking: BookingRecord, day: Date): boolean {
  const start = new Date(booking.pickup_at)
  const end = new Date(booking.return_at)
  const nextDay = new Date(day)
  nextDay.setDate(nextDay.getDate() + 1)
  return start < nextDay && end >= day
}

function BookingCard({ booking }: { booking: BookingRecord }) {
  const image = imageUrl(booking)
  const tooltip = `${vehicleName(booking)} | ${bookingDate(booking.pickup_at)} - ${bookingDate(booking.return_at)}`

  if (!image) return null

  return <Link className="inline-block rounded focus:outline-none focus:ring-2 focus:ring-[#ff641f]" to={`/admin/bookings?edit=${booking.id}`} title={tooltip} aria-label={`Edit booking: ${tooltip}`}>
    <img className="h-10 w-14 rounded object-contain" src={image} alt={tooltip} />
  </Link>
}

export default function CalendarPage() {
  const [bookings, setBookings] = useState<BookingRecord[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'month' | 'week'>('month')
  const [cursor, setCursor] = useState(() => new Date())

  useEffect(() => {
    api.get<Paginated<BookingRecord>>('/bookings?per_page=100')
      .then(result => setBookings(result.data.data))
      .catch(e => setError(e instanceof Error ? e.message : 'Unable to load calendar'))
      .finally(() => setLoading(false))
  }, [])

  const monthDays = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const start = startOfWeek(first)
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start)
      day.setDate(start.getDate() + index)
      return day
    })
  }, [cursor])

  const weekDays = useMemo(() => {
    const start = startOfWeek(cursor)
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(start)
      day.setDate(start.getDate() + index)
      return day
    })
  }, [cursor])

  const move = (amount: number) => {
    const next = new Date(cursor)
    if (view === 'month') next.setMonth(next.getMonth() + amount)
    else next.setDate(next.getDate() + amount * 7)
    setCursor(next)
  }

  const heading = view === 'month'
    ? cursor.toLocaleDateString([], { month: 'long', year: 'numeric' })
    : `${weekDays[0].toLocaleDateString([], { month: 'short', day: 'numeric' })} - ${weekDays[6].toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`

  return <AdminShell title="Booking calendar"><div className="mt-8 border border-black/10 bg-white p-4 md:p-6">
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div><p className="text-sm text-[#777]">Track vehicle bookings by month or week.</p><h2 className="mt-1 font-['Space_Grotesk'] text-2xl font-semibold">{heading}</h2></div>
      <div className="flex flex-wrap gap-2">
        <button className="border border-black/10 px-3 py-2 text-sm" onClick={() => setCursor(new Date())}>Today</button>
        <button className="border border-black/10 px-3 py-2 text-sm" onClick={() => move(-1)}>←</button>
        <button className="border border-black/10 px-3 py-2 text-sm" onClick={() => move(1)}>→</button>
        <button className={`px-3 py-2 text-sm ${view === 'month' ? 'bg-[#151515] text-white' : 'border border-black/10'}`} onClick={() => setView('month')}>Month</button>
        <button className={`px-3 py-2 text-sm ${view === 'week' ? 'bg-[#151515] text-white' : 'border border-black/10'}`} onClick={() => setView('week')}>Week</button>
      </div>
    </div>
    {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    {loading ? (
      <div className="mt-6">
        <div className="space-y-3 md:hidden">{[1, 2, 3, 4].map(item => <Skeleton className="h-20 w-full" key={item} />)}</div>
        <div className="hidden md:block"><CalendarSkeleton view={view} /></div>
      </div>
    ) : (
      <div className="mt-6">
        <div className="md:hidden"><MobileCalendarList bookings={bookings} cursor={cursor} view={view} /></div>
        <div className="hidden md:block">
          {view === 'month' ? <div className="w-full overflow-hidden"><div className="grid w-full grid-cols-7 border-l border-t border-black/10">
      {dayNames.map(day => <div className="border-b border-r border-black/10 bg-[#f8f7f5] p-2 text-[10px] font-bold uppercase tracking-widest text-[#888]" key={day}>{day.slice(0, 3)}</div>)}
      {monthDays.map(day => <div className={`min-h-32 border-b border-r border-black/10 p-2 ${day.getMonth() !== cursor.getMonth() ? 'bg-[#fafafa] text-[#aaa]' : ''}`} key={day.toISOString()}>
        <p className={`text-xs font-semibold ${sameDay(day, new Date()) ? 'text-[#ff641f]' : ''}`}>{day.getDate()}</p>
        <div className="mt-2 space-y-1">{bookings.filter(booking => !['pending', 'cancelled', 'rejected'].includes(booking.status) && overlapsDay(booking, day)).map(booking => <BookingCard booking={booking} key={`${booking.id}-${day.toISOString()}`} />)}</div>
      </div>)}
    </div></div> : <div className="w-full overflow-hidden"><div className="grid w-full grid-cols-7 border-l border-t border-black/10">
            {weekDays.map(day => <div className="border-b border-r border-black/10" key={day.toISOString()}><div className={`border-b border-black/10 p-3 ${sameDay(day, new Date()) ? 'bg-orange-50' : 'bg-[#f8f7f5]'}`}><p className="text-[10px] font-bold uppercase tracking-widest text-[#888]">{dayNames[day.getDay()]}</p><p className={`mt-1 font-['Space_Grotesk'] text-2xl font-semibold ${sameDay(day, new Date()) ? 'text-[#ff641f]' : ''}`}>{day.getDate()}</p></div><div className="min-h-96 space-y-2 p-2">{bookings.filter(booking => !['pending', 'cancelled', 'rejected'].includes(booking.status) && overlapsDay(booking, day)).map(booking => <BookingCard booking={booking} key={booking.id} />)}</div></div>)}
          </div></div>}
        </div>
      </div>
    )}
  </div></AdminShell>
}

function MobileCalendarList({ bookings, cursor, view }: { bookings: BookingRecord[]; cursor: Date; view: 'month' | 'week' }) {
  const start = view === 'week' ? startOfWeek(cursor) : new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const end = view === 'week' ? new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7) : new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59)
  const visible = bookings.filter(booking => !['pending', 'cancelled', 'rejected'].includes(booking.status) && new Date(booking.pickup_at) < end && new Date(booking.return_at) >= start).sort((left, right) => new Date(left.pickup_at).getTime() - new Date(right.pickup_at).getTime())
  if (visible.length === 0) return <p className="rounded border border-black/10 bg-[#fafafa] px-4 py-10 text-center text-sm text-[#777]">No active bookings in this period.</p>
  return <div className="space-y-3">{visible.map(booking => <Link className="flex items-center gap-3 rounded border border-black/10 bg-[#fafafa] p-3" to={`/admin/bookings?edit=${booking.id}`} key={booking.id}>
    {imageUrl(booking) ? <img className="h-14 w-16 shrink-0 rounded object-contain" src={imageUrl(booking)!} alt="" /> : <div className="h-14 w-16 shrink-0 rounded bg-black/5" />}
    <span className="min-w-0"><strong className="block truncate text-sm">{vehicleName(booking)}</strong><span className="mt-1 block text-xs text-[#777]">{bookingDate(booking.pickup_at)} → {bookingDate(booking.return_at)}</span><span className="mt-1 block text-xs capitalize text-[#999]">{booking.status.replace('_', ' ')}</span></span>
  </Link>)}</div>
}

function CalendarSkeleton({ view }: { view: 'month' | 'week' }) {
  const count = view === 'month' ? 42 : 7
  const cellHeight = view === 'month' ? 'min-h-32' : 'min-h-96'
  return <div className="mt-6 grid w-full grid-cols-7 border-l border-t border-black/10">
    {dayNames.map(day => <div className="border-b border-r border-black/10 bg-[#f8f7f5] p-2" key={day}><Skeleton className="h-3 w-8" /></div>)}
    {Array.from({ length: count }, (_, index) => (
      <div className={`${cellHeight} border-b border-r border-black/10 p-2`} key={index}>
        <Skeleton className="h-3 w-8" />
        <Skeleton className="mt-3 h-10 w-14" />
      </div>
    ))}
  </div>
}
