'use client'

import { SWRConfig } from 'swr'

// Global SWR configuration
const swrConfig = {
  // Global fetcher function
  fetcher: async (url: string) => {
    const response = await fetch(url)
    
    if (!response.ok) {
      const error = new Error('An error occurred while fetching the data.')
      // Attach extra info to the error object
      error.info = await response.json()
      error.status = response.status
      throw error
    }
    
    const data = await response.json()
    return data.success ? data.data : data
  },
  
  // Global error retry configuration
  errorRetryCount: 3,
  errorRetryInterval: 5000,
  
  // Global revalidation settings
  revalidateOnFocus: true,
  revalidateOnReconnect: true,
  
  // Cache settings
  dedupingInterval: 60 * 1000, // 1 minute
  refreshInterval: 0, // Disable automatic refresh (let individual hooks control this)
  
  // Loading timeout
  loadingTimeout: 30 * 1000, // 30 seconds
  
  // Error handler
  onError: (error, key) => {
    console.error('SWR Error:', error, 'Key:', key)
    
    // Optional: Send to monitoring service
    if (process.env.NODE_ENV === 'production') {
      // Example: Send to error tracking service
      // errorTracking.captureException(error, { extra: { swrKey: key } })
    }
  },
  
  // Success handler
  onSuccess: (data, key, config) => {
    // Optional: Log successful data fetches in development
    if (process.env.NODE_ENV === 'development') {
      console.log('SWR Success:', key, 'Data length:', Array.isArray(data) ? data.length : 'N/A')
    }
  }
}

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={swrConfig}>
      {children}
    </SWRConfig>
  )
}
