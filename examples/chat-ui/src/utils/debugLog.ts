// Debug logging helper
export const debugLog = (...args: any[]) => {
  if (typeof window !== 'undefined' && localStorage.getItem('USE_MCP_DEBUG') === 'true') {
    console.log(...args)
  }
}
