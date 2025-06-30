import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { chromium, Browser, Page } from 'playwright'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const testDir = join(__dirname, '..')
const testStateFile = join(testDir, 'node_modules/.cache/use-mcp-tests/test-state.json')

// Get MCP servers to test (ports determined at runtime)
function getMCPServers() {
  try {
    const stateData = readFileSync(testStateFile, 'utf-8')
    const state = JSON.parse(stateData)

    if (!state.honoPort) {
      throw new Error('hono-mcp port not found in test state')
    }

    if (!state.cfAgentsPort) {
      throw new Error('cf-agents port not found in test state')
    }

    return [
      {
        name: 'hono-mcp',
        url: `http://localhost:${state.honoPort}/mcp`,
        expectedTools: 1, // Minimum expected tools count
      },
      {
        name: 'cf-agents',
        url: `http://localhost:${state.cfAgentsPort}/mcp`,
        expectedTools: 1, // Minimum expected tools count
      },
    ]
  } catch (error) {
    throw new Error(`Test environment not properly initialized: ${error}`)
  }
}

async function connectToMCPServer(page: Page, serverUrl: string): Promise<{ success: boolean; tools: string[]; debugLog: string }> {
  // Navigate to the inspector
  const stateData = readFileSync(testStateFile, 'utf-8')
  const state = JSON.parse(stateData)

  if (!state.staticPort) {
    throw new Error('Static server port not available - state: ' + JSON.stringify(state))
  }
  const staticPort = state.staticPort

  await page.goto(`http://localhost:${staticPort}`)

  // Wait for the page to load
  await page.waitForSelector('input[placeholder="Enter MCP server URL"]', { timeout: 10000 })

  // Enter the server URL
  const urlInput = page.locator('input[placeholder="Enter MCP server URL"]')
  await urlInput.fill(serverUrl)

  // Click connect button
  const connectButton = page.locator('button:has-text("Connect")')
  await connectButton.click()

  // Wait for connection attempt to complete (max 10 seconds)
  await page.waitForTimeout(1000) // Initial wait

  // Check for connection status
  let attempts = 0
  const maxAttempts = 20 // 10 seconds total (500ms * 20)
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
    // Look for tool cards in the tools container
    const toolCards = page.locator('.bg-white.rounded.border')
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
    debugLog,
  }
}

describe('MCP Connection Integration Tests', () => {
  let browser: Browser
  let page: Page

  beforeAll(async () => {
    const headless = process.env.HEADLESS === 'true'
    console.log(`🌐 Launching browser in ${headless ? 'headless' : 'headed'} mode`)
    browser = await chromium.launch({ headless })
  }, 30000)

  afterAll(async () => {
    if (browser) {
      await browser.close()
    }

    // Force cleanup before Vitest exits - don't throw errors
    const state = globalThis.__INTEGRATION_TEST_STATE__
    try {
      if (state?.honoServer && !state.honoServer.killed) {
        console.log('🔥 Force cleanup before test exit...')
        state.honoServer.kill('SIGKILL')
      }
    } catch (e) {
      // Ignore errors - process might already be dead
    }

    try {
      if (state?.cfAgentsServer && !state.cfAgentsServer.killed) {
        console.log('🔥 Force cleanup cf-agents server...')
        state.cfAgentsServer.kill('SIGKILL')
      }
    } catch (e) {
      // Ignore errors - process might already be dead
    }

    try {
      if (state?.staticServer) {
        state.staticServer.close()
        state.staticServer.closeAllConnections?.()
      }
    } catch (e) {
      // Ignore errors
    }
  })

  beforeEach(async () => {
    const context = await browser.newContext()
    page = await context.newPage()

    // Enable console logging for debugging
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.error(`Browser error: ${msg.text()}`)
      }
    })
  })

  afterEach(async () => {
    if (page) {
      await page.close()
      await page.context().close()
    }
  })

  test('should connect to all MCP servers and retrieve tools', async () => {
    const servers = getMCPServers()

    for (const server of servers) {
      console.log(`\n🔗 Testing connection to ${server.name} at ${server.url}`)

      const result = await connectToMCPServer(page, server.url)

      if (result.success) {
        console.log(`✅ Successfully connected to ${server.name}`)
        console.log(`📋 Available tools (${result.tools.length}):`)
        result.tools.forEach((tool, index) => {
          console.log(`   ${index + 1}. ${tool}`)
        })

        // Verify connection success
        expect(result.success).toBe(true)
        expect(result.tools.length).toBeGreaterThanOrEqual(server.expectedTools)
      } else {
        console.log(`❌ Failed to connect to ${server.name}`)
        if (result.debugLog) {
          console.log(`🐛 Debug log:`)
          console.log(result.debugLog)
        }

        // Fail the test with detailed information
        throw new Error(`Failed to connect to ${server.name}. Debug log: ${result.debugLog}`)
      }
    }
  }, 45000)
})
