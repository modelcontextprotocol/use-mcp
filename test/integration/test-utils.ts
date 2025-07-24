import { spawn, type ChildProcess } from 'node:child_process'
import type { Page } from 'playwright'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const testDir = join(__dirname, '..')
const testStateFile = join(testDir, 'node_modules/.cache/use-mcp-tests/test-state.json')

export interface TestState {
  honoPort?: number
  cfAgentsPort?: number
  staticPort?: number
}

export interface ServerEndpoint {
  path: string
  transportTypes: ('auto' | 'http' | 'sse')[]
}

export interface ServerConfig {
  name: string
  directory: string
  portKey: keyof TestState
  endpoints: ServerEndpoint[]
  expectedTools: number
  expectedResources?: number
  expectedPrompts?: number
}

/**
 * Read the test state file containing server ports
 */
export function getTestState(): TestState {
  try {
    const stateData = readFileSync(testStateFile, 'utf-8')
    return JSON.parse(stateData)
  } catch (error) {
    throw new Error(`Test environment not properly initialized: ${error}`)
  }
}

/**
 * Wait for a process to output a specific string
 */
export function waitForOutput(process: ChildProcess, targetOutput: string, timeout = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for: ${targetOutput}`))
    }, timeout)

    const onData = (data: Buffer) => {
      const output = data.toString()
      console.log(`[server output] ${output}`)
      if (output.includes(targetOutput)) {
        clearTimeout(timer)
        process.stdout?.off('data', onData)
        process.stderr?.off('data', onData)
        resolve()
      }
    }

    process.stdout?.on('data', onData)
    process.stderr?.on('data', onData)
  })
}

/**
 * Check if a port is available
 */
export async function checkPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = require('net').createServer()

    server.listen(port, () => {
      server.close(() => {
        setTimeout(() => resolve(true), 100)
      })
    })

    server.on('error', (err: any) => {
      console.log(`Port ${port} check failed: ${err.message}`)
      resolve(false)
    })
  })
}

/**
 * Find an available port starting from a base port
 */
export function findAvailablePortFromBase(basePort: number): Promise<number> {
  return new Promise(async (resolve, reject) => {
    for (let port = basePort; port < basePort + 20; port++) {
      if (await checkPortAvailable(port)) {
        resolve(port)
        return
      }
    }
    reject(new Error(`No available ports found starting from ${basePort}`))
  })
}

/**
 * Spawn a server process in development mode
 */
export function spawnDevServer(serverName: string, directory: string, port: number, onOutput?: (data: string) => void): ChildProcess {
  const server = spawn('pnpm', ['wrangler', 'dev', `--port=${port}`], {
    cwd: directory,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    detached: false,
  })

  server.stdout?.on('data', (data) => {
    const output = `[${serverName}] ${data.toString()}`
    console.log(output)
    onOutput?.(output)
  })

  server.stderr?.on('data', (data) => {
    const output = `[${serverName}] ${data.toString()}`
    console.log(output)
    onOutput?.(output)
  })

  return server
}

/**
 * Connect to an MCP server through the inspector UI
 */
export async function connectToMCPServer(
  page: Page,
  serverUrl: string,
  transportType: 'auto' | 'http' | 'sse' = 'auto',
): Promise<{ success: boolean; tools: string[]; resources: string[]; prompts: string[]; debugLog: string }> {
  const state = getTestState()

  if (!state.staticPort) {
    throw new Error('Static server port not available - state: ' + JSON.stringify(state))
  }

  await page.goto(`http://localhost:${state.staticPort}`)
  await page.waitForSelector('input[placeholder="Enter MCP server URL"]', { timeout: 10000 })

  // Enter the server URL
  const urlInput = page.locator('input[placeholder="Enter MCP server URL"]')
  await urlInput.fill(serverUrl)

  // Set transport type
  const transportSelect = page.locator('select')
  await transportSelect.selectOption(transportType)

  // Click connect button
  const connectButton = page.locator('button:has-text("Connect")')
  await connectButton.click()

  // Wait for connection attempt to complete
  await page.waitForTimeout(1000)

  // Check for OAuth popup and handle it - try multiple times to catch different OAuth flows
  let oauthHandled = false
  for (let popupAttempt = 0; popupAttempt < 5 && !oauthHandled; popupAttempt++) {
    try {
      // Look for OAuth popup by checking for new pages
      const context = page.context()
      const initialPages = context.pages()

      // Wait a bit to see if OAuth popup appears
      await page.waitForTimeout(1000)

      const currentPages = context.pages()
      if (currentPages.length > initialPages.length) {
        // OAuth popup appeared, find it
        const popup = currentPages.find((p) => p !== page && p.url().includes('/authorize'))
        if (popup) {
          console.log('🔐 OAuth popup detected, clicking Approve button...')
          // Wait for the approval form to load
          await popup.waitForSelector('button.approve', { timeout: 5000 })
          // Click the Approve button
          await popup.click('button.approve')
          console.log('✅ Clicked Approve button')
          // Wait for popup to close
          await popup.waitForEvent('close', { timeout: 10000 })
          console.log('🔒 OAuth popup closed')
          oauthHandled = true
          break
        }
      }

      // Also check if there's a popup that opened that we haven't detected yet
      const allPages = context.pages()
      for (const possiblePopup of allPages) {
        if (possiblePopup !== page && possiblePopup.url().includes('/authorize')) {
          console.log('🔐 Found OAuth popup on retry, clicking Approve button...')
          await possiblePopup.waitForSelector('button.approve', { timeout: 5000 })
          await possiblePopup.click('button.approve')
          console.log('✅ Clicked Approve button')
          await possiblePopup.waitForEvent('close', { timeout: 10000 })
          console.log('🔒 OAuth popup closed')
          oauthHandled = true
          break
        }
      }
    } catch (e) {
      console.log(`ℹ️  OAuth popup attempt ${popupAttempt + 1} failed:`, e.message)
    }
  }

  if (!oauthHandled) {
    console.log('ℹ️  No OAuth popup detected after multiple attempts')
  }

  // Check for connection status
  let attempts = 0
  const maxAttempts = 20
  let isConnected = false

  while (attempts < maxAttempts && !isConnected) {
    try {
      // Check if status badge shows "Connected"
      const statusBadge = page.locator('.px-2.py-1.rounded-full')
      if ((await statusBadge.count()) > 0) {
        const statusText = await statusBadge.textContent({ timeout: 500 })
        if (statusText?.toLowerCase().includes('connected')) {
          isConnected = true
          break
        }
      }

      // Also check if tools count is > 0
      const toolsHeader = page.locator('h3:has-text("Available Tools")')
      if ((await toolsHeader.count()) > 0) {
        const toolsText = await toolsHeader.textContent()
        if (toolsText && /\d+/.test(toolsText)) {
          const toolsCount = parseInt(toolsText.match(/\d+/)?.[0] || '0')
          if (toolsCount > 0) {
            isConnected = true
            break
          }
        }
      }
    } catch (e) {
      // Continue waiting
    }

    await page.waitForTimeout(500)
    attempts++
  }

  // Extract available tools
  const tools: string[] = []
  try {
    // Look for the Available Tools section
    const toolsSection = page.locator('h3:has-text("Available Tools")').locator('..')
    const toolCards = toolsSection.locator('.bg-white.rounded.border')
    const toolCount = await toolCards.count()

    for (let i = 0; i < toolCount; i++) {
      const toolNameElement = toolCards.nth(i).locator('h4.font-bold.text-base.text-black')
      const toolName = await toolNameElement.textContent()
      if (toolName?.trim()) {
        tools.push(toolName.trim())
      }
    }
  } catch (e) {
    console.warn('Could not extract tools list:', e)
  }

  // Extract available resources
  const resources: string[] = []
  try {
    // Look for the Available Resources section
    const resourcesSection = page.locator('h3:has-text("Available Resources")').locator('..')
    const resourceCards = resourcesSection.locator('.bg-white.rounded.border')
    const resourceCount = await resourceCards.count()

    for (let i = 0; i < resourceCount; i++) {
      const resourceNameElement = resourceCards.nth(i).locator('h4.font-medium.text-sm')
      const resourceName = await resourceNameElement.textContent()
      if (resourceName?.trim()) {
        resources.push(resourceName.trim())
      }
    }
  } catch (e) {
    console.warn('Could not extract resources list:', e)
  }

  // Extract available prompts
  const prompts: string[] = []
  try {
    // Look for the Available Prompts section
    const promptsSection = page.locator('h3:has-text("Available Prompts")').locator('..')
    const promptCards = promptsSection.locator('.bg-white.rounded.border')
    const promptCount = await promptCards.count()

    for (let i = 0; i < promptCount; i++) {
      const promptNameElement = promptCards.nth(i).locator('h4.font-medium.text-sm')
      const promptName = await promptNameElement.textContent()
      if (promptName?.trim()) {
        prompts.push(promptName.trim())
      }
    }
  } catch (e) {
    console.warn('Could not extract prompts list:', e)
  }

  // Extract debug log
  let debugLog = ''
  try {
    const debugContainer = page.locator('.h-32.overflow-y-auto.font-mono.text-xs')
    if ((await debugContainer.count()) > 0) {
      debugLog = (await debugContainer.first().textContent()) || ''
    }
  } catch (e) {
    console.warn('Could not extract debug log:', e)
  }

  return {
    success: isConnected,
    tools,
    resources,
    prompts,
    debugLog,
  }
}

/**
 * Clean up a child process safely
 */
export function cleanupProcess(process: ChildProcess, name: string): void {
  try {
    if (process && !process.killed) {
      console.log(`🔥 Cleaning up ${name} server...`)
      process.kill('SIGKILL')
    }
  } catch (e) {
    // Ignore errors - process might already be dead
  }
}
