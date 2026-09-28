import { useEffect, useState } from 'react'
import { AdminShell } from '../components/AdminShell'
import api from '../lib/api'
import type { BookingRecord, Paginated } from '../types'

const apiOrigin = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api').replace(/\/api\/?$/, '')

export default function CalendarPage() {
  const [bookings, setBookings] = useState<BookingRecord[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<Paginated<BookingRecord>>('/bookings?per_page=50')
      .then(result => setBookings(result.data.data))
      .catch(e => setError(e instanceof Error ? e.message : 'Unable to load calendar'))
  }, [])

  return <AdminShell title="Booking calendar"><div className="mt-8 border border-black/10 bg-white p-4 md:p-6">
    <p className="text-sm text-[#777]">Booked vehicles and their rental periods.</p>
    {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {bookings.map(booking => {
        const image = booking.vehicle?.images?.[0]?.url
        return <article className="border border-black/10 p-4" key={booking.id}>
          {image && <img className="mb-4 h-32 w-full object-contain" src={image.startsWith('http') ? image : `${apiOrigin}/storage/${image.replace(/^\/+/, '')}`} alt={booking.vehicle ? (booking.vehicle.name || `${booking.vehicle.brand} ${booking.vehicle.model}`) : 'Vehicle'} />}
          <p className="font-semibold">{booking.vehicle ? (booking.vehicle.name || `${booking.vehicle.brand} ${booking.vehicle.model}`) : 'Vehicle'}</p>
          <p className="mt-2 text-sm text-[#777]">{new Date(booking.pickup_at).toLocaleDateString()} → {new Date(booking.return_at).toLocaleDateString()}</p>
          <p className="mt-2 text-xs uppercase tracking-widest text-[#888]">{booking.status}</p>
        </article>
      })}
    </div>
  </div></AdminShell>
}
