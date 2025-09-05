import { browser } from '$app/environment'
import { createMcp } from '@gary149/use-mcp/svelte'

export const mcp = browser
  ? createMcp({
      url: 'https://huggingface.co/mcp?login',
      clientName: 'My App',
      autoReconnect: true,
      transportType: 'http',
    })
  : undefined
