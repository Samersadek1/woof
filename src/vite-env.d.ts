/// <reference types="vite/client" />

declare module "*.txt?raw" {
  const src: string;
  export default src;
}

interface ImportMetaEnv {
  readonly VITE_ANTHROPIC_API_KEY?: string;
  /** Injected at build time by vite/buildVersion.ts */
  readonly VITE_APP_BUILD_ID: string;
}
