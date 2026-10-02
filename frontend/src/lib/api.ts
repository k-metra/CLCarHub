import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api',
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store',
    Pragma: 'no-cache',
  },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('clcarhub_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type']
  }
  return config
})

api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 413) {
      return Promise.reject(new Error('One or more uploaded files are too large. Please choose files smaller than 20 MB each and try again.'))
    }
    const validationErrors = error.response?.data?.errors
    const message = error.response?.data?.message
      ?? (validationErrors ? Object.values(validationErrors).flat().join(' ') : undefined)
      ?? error.message
      ?? 'Request failed'
    return Promise.reject(new Error(message))
  },
)

export default api
