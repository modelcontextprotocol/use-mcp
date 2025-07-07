import { test, expect } from '@playwright/test'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

interface ExecError extends Error {
  stdout?: string
  stderr?: string
}

test.describe('Build Tests', () => {
  test('should build without type errors', async () => {
    try {
      const { stderr } = await execAsync('pnpm build', {
        cwd: process.cwd(),
        timeout: 60000,
      })

      // Check for TypeScript compilation errors
      expect(stderr).not.toContain('error TS')
      expect(stderr).not.toContain('Type error')
    } catch (error) {
      const execError = error as ExecError
      console.error('Build failed:', execError.stdout, execError.stderr)
      throw new Error(`Build failed: ${execError.message}`)
    }
  })

  test('should lint without errors', async () => {
    try {
      const { stderr } = await execAsync('pnpm lint', {
        cwd: process.cwd(),
        timeout: 30000,
      })

      // ESLint should pass without errors
      expect(stderr).not.toContain('error')
    } catch (error) {
      const execError = error as ExecError
      console.error('Lint failed:', execError.stdout, execError.stderr)
      throw new Error(`Lint failed: ${execError.message}`)
    }
  })
})
