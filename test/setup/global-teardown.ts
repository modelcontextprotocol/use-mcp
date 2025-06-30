export default async function globalTeardown() {
  console.log('🧹 Cleaning up integration test environment...')
  
  const state = globalThis.__INTEGRATION_TEST_STATE__
  
  // First try to stop the hono server directly
  if (state?.honoServer && !state.honoServer.killed) {
    console.log('🛑 Stopping hono server directly...')
    try {
      state.honoServer.kill('SIGTERM')
      
      // Wait for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      if (!state.honoServer.killed) {
        console.log('⚡ Force killing hono server...')
        state.honoServer.kill('SIGKILL')
      }
    } catch (e) {
      console.warn('Error stopping hono server:', e)
    }
  }
  
  // Also try process group cleanup as backup
  if (state?.processGroupId) {
    console.log('🛑 Cleaning up process group as backup...')
    
    try {
      // Send SIGTERM to the entire process group first
      console.log(`💀 Sending SIGTERM to process group ${state.processGroupId}`)
      process.kill(-state.processGroupId, 'SIGTERM')
      
      // Wait a bit for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Then send SIGKILL to ensure everything is terminated
      console.log(`⚡ Sending SIGKILL to process group ${state.processGroupId}`)
      process.kill(-state.processGroupId, 'SIGKILL')
      
    } catch (e) {
      console.warn('Error terminating process group:', e)
    }
  }
  
  if (state?.staticServer) {
    console.log('🛑 Stopping static file server...')
    await new Promise<void>((resolve) => {
      state.staticServer?.close((err) => {
        if (err) {
          console.warn('Warning closing static server:', err.message)
        }
        resolve()
      })
    })
    
    // Force close all keep-alive connections
    state.staticServer?.closeAllConnections?.()
  }
  
  // Clear references 
  if (state) {
    state.honoServer = undefined
    state.staticServer = undefined
    state.processGroupId = undefined
  }
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc()
  }
  
  console.log('✅ Cleanup complete!')
}
