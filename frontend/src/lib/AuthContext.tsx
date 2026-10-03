/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import api from './api'
import { LoadingScreen } from '../components/Ui'

export type AuthUser = {
  id: number
  name: string
  username?: string | null
  email: string
  role: string
  first_name?: string | null
  middle_name?: string | null
  last_name?: string | null
  date_of_birth?: string | null
  email_verified_at?: string | null
}

export function displayName(user: Pick<AuthUser, 'first_name' | 'middle_name' | 'last_name' | 'username' | 'name'>) {
  if (user.first_name?.trim() && user.middle_name?.trim() && user.last_name?.trim()) {
    return [user.first_name, user.middle_name, user.last_name].join(' ')
  }
  return user.username?.trim() || user.name
}

export type AdminRole = 'owner' | 'co_owner' | 'it_management' | 'staff'

export function canManageAccounts(user: AuthUser | null) {
  return !!user && ['owner', 'co_owner', 'it_management'].includes(user.role)
}

export function canViewReports(user: AuthUser | null) {
  return !!user && ['owner', 'co_owner', 'it_management'].includes(user.role)
}

type AuthContextValue = {
  user: AuthUser | null
  loading: boolean
  setSession: (token: string, user: AuthUser) => void
  updateUser: (user: Partial<AuthUser>) => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(Boolean(localStorage.getItem('clcarhub_token')))

  useEffect(() => {
    const token = localStorage.getItem('clcarhub_token')
    if (!token) return

    api.get<AuthUser>('/auth/user')
      .then(response => setUser(response.data))
      .catch(() => {
        localStorage.removeItem('clcarhub_token')
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const setSession = (token: string, authenticatedUser: AuthUser) => {
    localStorage.setItem('clcarhub_token', token)
    setUser(authenticatedUser)
  }

  const updateUser = (updates: Partial<AuthUser>) => {
    setUser(current => current ? { ...current, ...updates } : current)
  }

  const logout = async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      localStorage.removeItem('clcarhub_token')
      setUser(null)
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, setSession, updateUser, logout }}>
      {loading ? <LoadingScreen label="Loading your workspace" /> : children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}

export function accountPath(user: AuthUser) {
  return user.role === 'customer' ? '/account' : '/admin'
}

export function useSignOut() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  return async () => {
    await logout()
    navigate('/admin/login', { replace: true })
  }
}
