/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `1` = card books in bundle (native/dev); `0` = public web stub. */
  readonly VITE_CARD_CONTENT: '0' | '1'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
