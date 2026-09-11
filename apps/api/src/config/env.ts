import { z } from 'zod';

const boolFromEmpty = (v: string | undefined) => (v && v.length > 0 ? v : undefined);

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  PORT: z.coerce.number().int().positive().default(8092),
  SESSION_SECRET: z.string().min(16, 'SESSION_SECRET debe tener al menos 16 caracteres'),
  TL_PASSWORD: z.string().min(1, 'TL_PASSWORD es obligatoria'),
  VIEWER_PASSWORD: z
    .string()
    .optional()
    .transform((v) => boolFromEmpty(v)),
  JIRA_BASE_URL: z.string().optional(),
  JIRA_EMAIL: z.string().optional(),
  JIRA_API_TOKEN: z.string().optional(),
  JIRA_PROJECT: z.string().optional(),
  // 'basic' (por defecto): Authorization Basic email:token, estándar para self-hosted con un
  // API token clásico de Atlassian. 'bearer': Authorization Bearer <token>, para despliegues
  // que autentican vía OAuth 2.0 (3LO) en vez de un API token de usuario.
  JIRA_AUTH_MODE: z.enum(['basic', 'bearer']).default('basic'),
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_ORG: z.string().optional(),
  // Lista de repos separados por coma, p.ej. "svc-a,svc-b". Sin esto, la sync de GitHub no
  // hace nada aunque haya token+org (ver módulo settings/discover en fases posteriores).
  GITHUB_REPOS: z.string().optional(),
  SYNC_MINUTES: z.coerce.number().int().positive().default(30),
  SINCE_DATE: z.string().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | undefined;

/**
 * Parsea y valida `process.env`. Lanza si falta algo obligatorio (fail-fast al arrancar).
 * Memoiza el resultado; usar `resetEnvForTests()` en tests que cambien `process.env`.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cachedEnv) return cachedEnv;
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Configuración inválida: ${message}`);
  }
  cachedEnv = parsed.data;
  return cachedEnv;
}

export function resetEnvForTests(): void {
  cachedEnv = undefined;
}
