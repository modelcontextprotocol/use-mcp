/// <reference types="vite/client" />

declare global {
  interface Window {
    apiKeyModalResolve?: (value: boolean) => void;
  }
}

export {};
