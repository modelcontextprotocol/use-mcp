const API_KEY_PREFIX = 'aiChatTemplate_apiKey_'

export const getApiKey = (providerId: string): string | null => {
  return localStorage.getItem(`${API_KEY_PREFIX}${providerId}`)
}

export const setApiKey = (providerId: string, apiKey: string): void => {
  localStorage.setItem(`${API_KEY_PREFIX}${providerId}`, apiKey)
}

export const clearApiKey = (providerId: string): void => {
  localStorage.removeItem(`${API_KEY_PREFIX}${providerId}`)
}

export const hasApiKey = (providerId: string): boolean => {
  return getApiKey(providerId) !== null
}
