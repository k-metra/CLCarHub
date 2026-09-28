import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import api from '../lib/api'
import { AdminShell } from '../components/AdminShell'

export default function AdminDashboardPage() {
  const [stats, setStats] = useState({ vehicles: 0, bookings: 0, customers: 0 })
  const [error, setError] = useState('')
  useEffect(() => { Promise.all([api.get<{ total: number }>('/vehicles?per_page=1'), api.get<{ total: number }>('/bookings?per_page=1'), api.get<{ total: number }>('/customers?per_page=1')]).then(([vehicles, bookings, customers]) => setStats({ vehicles: vehicles.data.total, bookings: bookings.data.total, customers: customers.data.total })).catch(e => setError(e instanceof Error ? e.message : 'Unable to load dashboard')) }, [])
  if (!localStorage.getItem('clcarhub_token')) return <Navigate to="/admin/login" replace />
  return <AdminShell title="Overview"><div className="mt-8"><p className="text-[10px] font-bold uppercase tracking-[2.7px] text-[#ff641f]">OVERVIEW</p><h2 className="mt-2 font-['Space_Grotesk'] text-4xl font-semibold tracking-[-2px]">Good morning, Owner.</h2><p className="mt-2 text-sm text-[#777]">Here’s what’s happening across your rental operation.</p>{error && <p className="mt-6 text-sm text-red-600">{error}</p>}<div className="mt-10 grid gap-4 md:grid-cols-3">{[['Total vehicles', stats.vehicles], ['Bookings', stats.bookings], ['Customers', stats.customers]].map(([label, value]) => <div className="border border-black/10 bg-white p-6" key={label as string}><p className="text-xs uppercase tracking-widest text-[#888]">{label}</p><strong className="mt-4 block font-['Space_Grotesk'] text-4xl">{value}</strong><p className="mt-2 text-xs text-[#62a477]">Live from Laravel API</p></div>)}</div><div className="mt-8 grid gap-4 md:grid-cols-2"><Link className="border border-black/10 bg-white p-6 hover:border-[#ff641f]" to="/admin/vehicles"><p className="text-xs uppercase tracking-widest text-[#ff641f]">Fleet management</p><h2 className="mt-3 font-['Space_Grotesk'] text-2xl">Vehicles →</h2></Link><Link className="border border-black/10 bg-white p-6 hover:border-[#ff641f]" to="/admin/bookings"><p className="text-xs uppercase tracking-widest text-[#ff641f]">Rental operations</p><h2 className="mt-3 font-['Space_Grotesk'] text-2xl">Bookings →</h2></Link></div></div></AdminShell>
}
