function isProcessRunning(pid: number): boolean {
  try {
    // Sending signal 0 checks if process exists without actually sending a signal
    process.kill(pid, 0)
    return true
  } catch (e) {
    return false
  }
}

async function findChildProcesses(parentPid: number): Promise<number[]> {
  return new Promise((resolve) => {
    const { spawn } = require('child_process')
    // Use ps to find all child processes
    const ps = spawn('ps', ['-o', 'pid,ppid', '-ax'])

    let output = ''
    ps.stdout?.on('data', (data: Buffer) => {
      output += data.toString()
    })

    ps.on('close', () => {
      const lines = output.split('\n')
      const children: number[] = []

      for (const line of lines) {
        const match = line.trim().match(/^(\d+)\s+(\d+)/)
        if (match) {
          const pid = parseInt(match[1])
          const ppid = parseInt(match[2])
          if (ppid === parentPid) {
            children.push(pid)
          }
        }
      }

      resolve(children)
    })

    ps.on('error', () => {
      resolve([])
    })
  })
}

async function killProcessSafely(pid: number, name: string = 'process'): Promise<void> {
  if (!isProcessRunning(pid)) {
    console.log(`✅ ${name} (${pid}) already stopped`)
    return
  }

  try {
    console.log(`🛑 Sending SIGTERM to ${name} (${pid})`)
    process.kill(pid, 'SIGTERM')

    // Wait up to 3 seconds for graceful shutdown
    for (let i = 0; i < 30; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      if (!isProcessRunning(pid)) {
        console.log(`✅ ${name} (${pid}) gracefully stopped`)
        return
      }
    }

    // Force kill if still running
    if (isProcessRunning(pid)) {
      console.log(`⚡ Force killing ${name} (${pid})`)
      process.kill(pid, 'SIGKILL')

      // Give it a moment to die
      await new Promise((resolve) => setTimeout(resolve, 100))

      if (isProcessRunning(pid)) {
        console.warn(`⚠️ ${name} (${pid}) still running after SIGKILL`)
      } else {
        console.log(`✅ ${name} (${pid}) force killed`)
      }
    }
  } catch (e: any) {
    if (e.code === 'ESRCH') {
      console.log(`✅ ${name} (${pid}) already stopped`)
    } else {
      console.warn(`Error killing ${name} (${pid}):`, e.message)
    }
  }
}

export default async function globalTeardown() {
  console.log('🧹 Cleaning up integration test environment...')

  const state = globalThis.__INTEGRATION_TEST_STATE__

  // Kill all tracked child processes first
  if (state?.allChildProcesses && state.allChildProcesses.size > 0) {
    console.log(`🛑 Cleaning up ${state.allChildProcesses.size} tracked child processes...`)

    // Find all child processes of our tracked processes too
    const allPidsToKill = new Set<number>()

    for (const pid of state.allChildProcesses) {
      allPidsToKill.add(pid)

      // Find children of this process
      const children = await findChildProcesses(pid)
      for (const childPid of children) {
        allPidsToKill.add(childPid)
      }
    }

    console.log(`🛑 Found ${allPidsToKill.size} total processes to clean up (including children)`)

    const killPromises = Array.from(allPidsToKill).map((pid) => killProcessSafely(pid, 'process'))

    await Promise.all(killPromises)
  }

  // Also clean up by process group as backup
  if (state?.processGroupId && isProcessRunning(state.processGroupId)) {
    console.log('🛑 Cleaning up process group as backup...')

    try {
      // Send SIGTERM to the entire process group first
      console.log(`💀 Sending SIGTERM to process group ${state.processGroupId}`)
      process.kill(-state.processGroupId, 'SIGTERM')

      // Wait a bit for graceful shutdown
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Check if any processes in the group are still running and force kill if needed
      try {
        process.kill(-state.processGroupId, 0) // Check if group exists
        console.log(`⚡ Sending SIGKILL to process group ${state.processGroupId}`)
        process.kill(-state.processGroupId, 'SIGKILL')
      } catch (e: any) {
        if (e.code !== 'ESRCH') {
          console.warn('Error force-killing process group:', e.message)
        }
      }
    } catch (e: any) {
      if (e.code !== 'ESRCH') {
        console.warn('Error terminating process group:', e.message)
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
    state.processGroupId = undefined
  }

  // Force garbage collection if available
  if (global.gc) {
    global.gc()
  }

  console.log('✅ Cleanup complete!')
}
