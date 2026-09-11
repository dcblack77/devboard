// Declaración mínima de cookie-parser (evita depender de @types/cookie-parser).
declare module 'cookie-parser' {
  import type { RequestHandler } from 'express';
  function cookieParser(secret?: string | string[], options?: object): RequestHandler;
  export default cookieParser;
}
