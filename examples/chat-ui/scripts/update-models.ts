#!/usr/bin/env tsx

import { writeFileSync } from 'fs'
import { join } from 'path'

interface ModelData {
  id: string
  name: string
  attachment: boolean
  reasoning: boolean
  temperature: boolean
  tool_call: boolean
  knowledge: string
  release_date: string
  last_updated: string
  modalities: {
    input: string[]
    output: string[]
  }
  open_weights: boolean
  limit: {
    context: number
    output: number
  }
  cost?: {
    input: number
    output: number
    cache_read?: number
    cache_write?: number
  }
}

interface ProviderData {
  models: Record<string, ModelData>
}

interface ModelsDevData {
  anthropic: ProviderData
  groq: ProviderData
  openrouter: ProviderData
  [key: string]: ProviderData
}

const SUPPORTED_PROVIDERS = ['anthropic', 'groq', 'openrouter'] as const
type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number]

async function fetchModelsData(): Promise<ModelsDevData> {
  console.log('Fetching models data from models.dev...')

  const response = await fetch('https://models.dev/api.json')
  if (!response.ok) {
    throw new Error(`Failed to fetch models data: ${response.status} ${response.statusText}`)
  }

  return await response.json()
}

function filterAndTransformModels(data: ModelsDevData) {
  const filtered: Record<SupportedProvider, Record<string, ModelData>> = {
    anthropic: {},
    groq: {},
    openrouter: {},
  }

  // Filter by supported providers
  for (const provider of SUPPORTED_PROVIDERS) {
    if (data[provider] && data[provider].models) {
      filtered[provider] = data[provider].models
    }
  }

  return filtered
}

async function main() {
  try {
    const data = await fetchModelsData()
    const filteredData = filterAndTransformModels(data)

    const outputPath = join(process.cwd(), 'src', 'data', 'models.json')
    writeFileSync(outputPath, JSON.stringify(filteredData, null, 2))

    console.log(`✅ Models data updated successfully at ${outputPath}`)

    // Print summary
    let totalModels = 0
    let toolSupportingModels = 0

    for (const [provider, models] of Object.entries(filteredData)) {
      const modelCount = Object.keys(models).length
      const toolModels = Object.values(models).filter((m) => m.tool_call).length

      console.log(`  ${provider}: ${modelCount} models (${toolModels} support tools)`)
      totalModels += modelCount
      toolSupportingModels += toolModels
    }

    console.log(`\nTotal: ${totalModels} models (${toolSupportingModels} support tools)`)
  } catch (error) {
    console.error('❌ Failed to update models data:', error)
    process.exit(1)
  }
}

main()
