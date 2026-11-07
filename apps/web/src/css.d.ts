/** Side-effect CSS imports (themes loaded on demand). */
declare module '*.css';

interface ImportMetaEnv { readonly VITE_STATIC?: string; readonly VITE_THEME?: string; readonly VITE_SNAPSHOT_AT?: string }
interface ImportMeta { readonly env: ImportMetaEnv }
