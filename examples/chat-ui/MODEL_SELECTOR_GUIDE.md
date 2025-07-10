# Model Selector Guide

This guide explains how to use the new favorites-based model selector system.

## Overview

The chat UI now supports:
- **39 models** from 3 providers (Anthropic, Groq, OpenRouter)
- **Favorites system** - star your preferred models
- **Search functionality** - find models by name or provider
- **Tool filtering** - show only models that support tool calling
- **OAuth authentication** - seamless OpenRouter integration

## Features

### Model Selection
- Click the model selector to view all available models
- Models are loaded from the live models.dev API
- Each model shows provider logo, name, and capabilities

### Favorites System
- ⭐ Star models to add them to your favorites
- Starred models are saved to local storage
- Use the "Favorites" filter to show only starred models

### Search & Filtering
- 🔍 Search box to find models by name or provider
- 🔧 "Tools Only" filter (appears when MCP tools are available)
- ⭐ "Favorites" filter to show only starred models

### Authentication
- **API Keys**: Enter manually for Anthropic and Groq
- **OAuth**: One-click authentication for OpenRouter
- Authentication status shown with icons (✓ or ⚠️)

## Provider Support

### Anthropic
- **Models**: 9 models including Claude 4 Sonnet
- **Auth**: API key (requires manual entry)
- **Tools**: All models support tool calling

### Groq
- **Models**: 13 models including Llama and Qwen variants
- **Auth**: API key (requires manual entry)
- **Tools**: 11 models support tool calling

### OpenRouter
- **Models**: 17 models from various providers
- **Auth**: OAuth PKCE flow (one-click authentication)
- **Tools**: All models support tool calling

## Setting Up OpenRouter OAuth

1. Create an OpenRouter account at https://openrouter.ai
2. Go to your dashboard and create an OAuth app
3. Set the redirect URI to: `http://localhost:5002/oauth/openrouter/callback`
4. Copy your client ID to your `.env` file:
   ```
   VITE_OPENROUTER_CLIENT_ID=your_client_id_here
   ```

## Usage Tips

1. **Star your favorites** - This makes model selection much faster
2. **Use search** - With 39 models, search helps find what you need
3. **Filter by tools** - When using MCP tools, enable "Tools Only" filter
4. **Try different providers** - Each has unique models with different strengths

## Model Data Updates

Model data is fetched from models.dev API and can be updated with:

```bash
pnpm update-models
```

This will refresh the model list with the latest information from the API.

## Local Storage

The following preferences are saved locally:
- **Favorites**: `aiChatTemplate_favorites_v1`
- **Tokens**: `aiChatTemplate_token_[provider]`
- **Selected Model**: `aiChatTemplate_selectedModel`

## Troubleshooting

- **OAuth popup blocked**: Allow popups for this site
- **Authentication failed**: Check your API keys or re-authenticate
- **Model not working**: Verify the model supports the features you're using
- **Tools not showing**: Enable "Tools Only" filter when MCP tools are configured
