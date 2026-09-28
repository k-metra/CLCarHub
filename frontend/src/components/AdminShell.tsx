import type { ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { apiRequest } from '../lib/api'

export function AdminShell({ children, title }: { children: ReactNode; title: string }) {
  const navigate = useNavigate()
  const logout = async () => {
    await apiRequest('/auth/logout', { method: 'POST' }).catch(() => undefined)
    localStorage.removeItem('clcarhub_token')
    navigate('/admin/login')
  }

  if (!localStorage.getItem('clcarhub_token')) return <Navigate to="/admin/login" replace />

  return <div className="min-h-screen bg-[#f4f3f0] text-[#151515]"><header className="flex h-20 items-center justify-between border-b border-black/10 bg-[#111] px-6 text-white md:px-10"><Link className="font-['Space_Grotesk'] text-xl font-bold" to="/admin">CL<span className="text-[#ff641f]">CarHub</span></Link><div className="flex items-center gap-5"><Link className="text-sm text-[#bbb] hover:text-white" to="/">Website ↗</Link><button className="text-sm text-[#bbb] hover:text-white" onClick={logout}>Sign out ↗</button></div></header><main className="mx-auto max-w-[1200px] px-6 py-10 md:px-10"><Link className="text-xs text-[#ff641f]" to="/admin">← Dashboard</Link><div className="mt-5"><p className="text-[10px] font-bold uppercase tracking-[2.7px] text-[#ff641f]">ADMINISTRATION</p><h1 className="mt-2 font-['Space_Grotesk'] text-4xl font-semibold tracking-[-2px]">{title}</h1></div>{children}</main></div>
}
