/// <reference types="vite/client" />

declare module "*.txt?raw" {
  const src: string;
  export default src;
}

interface ImportMetaEnv {
  readonly VITE_ANTHROPIC_API_KEY?: string;
}
