export default async function globalTeardown() {
  console.log('🧹 Cleaning up integration test environment...')
  
  const state = globalThis.__INTEGRATION_TEST_STATE__
  
  if (state?.honoServer) {
    console.log('🛑 Stopping hono-mcp server...')
    state.honoServer.kill('SIGTERM')
    
    // Give it time to shut down gracefully
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Force kill if still running
    try {
      state.honoServer.kill('SIGKILL')
    } catch (e) {
      // Process might already be dead
    }
  }
  
  if (state?.staticServer) {
    console.log('🛑 Stopping static file server...')
    state.staticServer.close()
  }
  
  console.log('✅ Cleanup complete!')
}
