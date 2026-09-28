/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import api from './api'

export type AuthUser = {
  id: number
  name: string
  username?: string | null
  email: string
  role: string
}

type AuthContextValue = {
  user: AuthUser | null
  loading: boolean
  setSession: (token: string, user: AuthUser) => void
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

  const logout = async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      localStorage.removeItem('clcarhub_token')
      setUser(null)
    }
  }

  return <AuthContext.Provider value={{ user, loading, setSession, logout }}>{children}</AuthContext.Provider>
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
