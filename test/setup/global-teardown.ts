export default async function globalTeardown() {
  console.log('🧹 Cleaning up integration test environment...')
  
  const state = globalThis.__INTEGRATION_TEST_STATE__
  
  if (state?.honoServer) {
    console.log('🛑 Stopping hono-mcp server...')
    
    // Store the PID for cleanup
    const honoServerPid = state.honoServer.pid
    
    // Send SIGTERM first for graceful shutdown
    if (!state.honoServer.killed) {
      state.honoServer.kill('SIGTERM')
      
      // Wait for graceful shutdown
      await new Promise(resolve => {
        const timeout = setTimeout(() => {
          // Force kill if still running after 2 seconds
          if (!state.honoServer?.killed) {
            console.log('⚡ Force stopping hono-mcp server...')
            state.honoServer?.kill('SIGKILL')
          }
          resolve(void 0)
        }, 2000)
        
        state.honoServer?.on('exit', () => {
          clearTimeout(timeout)
          resolve(void 0)
        })
      })
    }
    
    // Also kill any remaining wrangler/workerd child processes
    if (honoServerPid) {
      try {
        // Kill any child processes that might still be running
        const { spawn } = require('child_process')
        spawn('pkill', ['-P', honoServerPid.toString()], { stdio: 'ignore' })
      } catch (e) {
        // Ignore errors
      }
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
  }
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc()
  }
  
  console.log('✅ Cleanup complete!')
}
