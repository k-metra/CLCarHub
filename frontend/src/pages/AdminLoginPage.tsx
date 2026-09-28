import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiRequest } from '../lib/api'
import { Button, Eyebrow } from '../components/Ui'

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('owner@clcarhub.com')
  const [password, setPassword] = useState('password')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setLoading(true)
    try { const result = await apiRequest<{ token: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }); localStorage.setItem('clcarhub_token', result.token); navigate('/admin') }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to sign in') }
    finally { setLoading(false) }
  }
  return <div className="flex min-h-screen items-center justify-center bg-[#0b0b0b] px-5 text-white"><div className="w-full max-w-[430px] border border-white/[.1] bg-[#151515] p-8 shadow-2xl md:p-10"><Link className="font-['Space_Grotesk'] text-[21px] font-bold" to="/">CL<span className="text-[#ff641f]">CarHub</span></Link><div className="mt-12"><Eyebrow>ADMIN PORTAL</Eyebrow><h1 className="mt-4 font-['Space_Grotesk'] text-4xl font-semibold tracking-[-2px]">Welcome back.</h1><p className="mt-3 text-sm text-[#888]">Sign in to manage your fleet and bookings.</p></div><form className="mt-8 space-y-5" onSubmit={submit}><label className="block text-xs text-[#aaa]">Email<input className="mt-2 w-full border border-white/[.12] bg-[#0d0d0d] px-4 py-3 text-sm text-white outline-none focus:border-[#ff641f]" type="email" value={email} onChange={event => setEmail(event.target.value)} required /></label><label className="block text-xs text-[#aaa]">Password<input className="mt-2 w-full border border-white/[.12] bg-[#0d0d0d] px-4 py-3 text-sm text-white outline-none focus:border-[#ff641f]" type="password" value={password} onChange={event => setPassword(event.target.value)} required /></label>{error && <p className="text-xs text-[#ff8b68]">{error}</p>}<Button>{loading ? 'Signing in...' : 'Sign in'} <span className="ml-3">→</span></Button></form></div></div>
}
