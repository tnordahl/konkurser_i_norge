import { initializeScheduler } from './scheduler'

/**
 * Initialize application services
 * This should be called when the application starts
 */
export function initializeApp() {
  console.log('Initializing Konkurser i Norge application...')
  
  // Initialize the data update scheduler
  initializeScheduler()
  
  console.log('Application initialization complete')
}

// Auto-initialize when this module is imported in a server environment
if (typeof window === 'undefined' && process.env.NODE_ENV !== 'test') {
  initializeApp()
}
