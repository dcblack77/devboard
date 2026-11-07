/**
 * URL base para abrir issues en el navegador. Solo sitios `*.atlassian.net` (u otra URL de
 * sitio); el gateway `api.atlassian.com/ex/jira/<cloudId>` no sirve para navegar.
 */
export function jiraBrowseBase(baseUrl: string | undefined): string | null {
  if (!baseUrl) return null;
  const clean = baseUrl.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(clean) || clean.includes('api.atlassian.com')) return null;
  return `${clean}/browse/`;
}
