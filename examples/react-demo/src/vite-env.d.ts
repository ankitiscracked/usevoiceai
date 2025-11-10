/// <reference types="vite/client" />

declare interface ImportMetaEnv {
  readonly VITE_VOICECN_WS_URL?: string;
  readonly VITE_VOICECN_USE_MOCK?: string;
}

declare interface ImportMeta {
  readonly env: ImportMetaEnv;
}
