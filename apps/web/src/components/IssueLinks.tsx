import { createContext, useContext, useEffect, useState } from 'react';
import type { IssueLinksResponse, LinkedPrDto } from '@devboard/shared';
import { api } from '../api/client';

const EMPTY: IssueLinksResponse = { jiraBrowseUrl: null, prsByIssue: {} };
const LinksContext = createContext<IssueLinksResponse>(EMPTY);

/** Carga una vez los enlaces (Jira + PRs por issue); `version` fuerza recarga tras actualizar datos. */
export function LinksProvider({ version, children }: { version: number; children: React.ReactNode }) {
  const [links, setLinks] = useState<IssueLinksResponse>(EMPTY);
  useEffect(() => {
    api.links().then(setLinks).catch(() => setLinks(EMPTY));
  }, [version]);
  return <LinksContext.Provider value={links}>{children}</LinksContext.Provider>;
}

export function useIssueLinks(): IssueLinksResponse {
  return useContext(LinksContext);
}

/** Clave de issue enlazada a Jira (se abre en pestaña nueva). Sin URL de Jira, texto plano. */
export function IssueKey({ issueKey }: { issueKey: string }) {
  const { jiraBrowseUrl } = useIssueLinks();
  if (!jiraBrowseUrl) return <>{issueKey}</>;
  return (
    <a href={jiraBrowseUrl + encodeURIComponent(issueKey)} target="_blank" rel="noreferrer" title="Abrir en Jira">
      {issueKey}
    </a>
  );
}

const STATE_LABEL: Record<LinkedPrDto['state'], string> = {
  open: 'abierta',
  draft: 'borrador',
  merged: 'mergeada',
  closed: 'cerrada',
};

/** PRs de GitHub asociadas a la issue, como enlaces con su estado. "—" si no hay. */
export function IssuePrs({ issueKey }: { issueKey: string }) {
  const prs = useIssueLinks().prsByIssue[issueKey.toUpperCase()] ?? [];
  if (prs.length === 0) return <span className="muted">—</span>;
  return (
    <span className="pr-links">
      {prs.map((p) => (
        <a key={p.url} href={p.url} target="_blank" rel="noreferrer" className={`pr-link pr-${p.state}`}
          title={`${p.repo} #${p.number} · ${STATE_LABEL[p.state]}`}>
          {p.repo} #{p.number} <small>{STATE_LABEL[p.state]}</small>
        </a>
      ))}
    </span>
  );
}

/** Texto plano de las PRs (para filtrar/ordenar en tablas). */
export function prsText(links: IssueLinksResponse, issueKey: string): string {
  return (links.prsByIssue[issueKey.toUpperCase()] ?? []).map((p) => `${p.repo} #${p.number}`).join(' ');
}
