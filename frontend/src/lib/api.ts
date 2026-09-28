const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api'

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('clcarhub_token')
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })

  if (!response.ok) {
    throw new Error((await response.json().catch(() => null))?.message ?? 'Request failed')
  }

  return response.status === 204 ? (undefined as T) : response.json()
}
