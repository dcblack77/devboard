/**
 * Parser puro de PrNode → ParsedPr. Portado de
 * workspace/team-board/github_reviews.py::analyze (parte por-PR, sin
 * agregados de equipo/persona — esos van en domain/metrics/github.ts,
 * fase 2).
 *
 * Reglas:
 * - `readyAt` = último ReadyForReviewEvent, o `createdAt` si no hay ninguno.
 * - reviews: excluye al propio autor, a bots, y las que no tengan
 *   `submittedAt` (incluye state PENDING, que nunca lo tiene).
 * - `issueKeys`: regex sobre título + rama, en mayúsculas, sin duplicados.
 * - `hotfix`: regex sobre título + rama.
 */
import type { PrNode, ParsedPr, ParseOptions, ReviewParsed, ReviewRequestParsed, PrState } from './types.js';

export const DEFAULT_BOT_PATTERNS = ['dependabot', 'github-actions', 'renovate', 'copilot'];
export const DEFAULT_HOTFIX_REGEX = /(^|[^a-z])(hf|hotfix|hot-fix)([^a-z]|$)/i;

function isBotLogin(login: string, botPatterns: string[]): boolean {
  const lower = login.toLowerCase();
  return botPatterns.some((b) => lower.includes(b.toLowerCase()));
}

function prState(node: PrNode): PrState {
  if (node.mergedAt) return 'merged';
  if (node.state === 'CLOSED' || node.closedAt) return 'closed';
  return 'open';
}

function extractIssueKeys(text: string, regex?: RegExp): string[] {
  if (!regex) return [];
  // asegura la flag global sin depender del regex pasado por el caller
  const flags = regex.flags.includes('g') ? regex.flags : regex.flags + 'g';
  const re = new RegExp(regex.source, flags);
  const matches = text.match(re) ?? [];
  return [...new Set(matches.map((m) => m.toUpperCase()))].sort();
}

/** Convierte un nodo GraphQL de PR en un objeto listo para persistir/analizar. */
export function toPullRequest(node: PrNode, options: ParseOptions = {}): ParsedPr {
  const botPatterns = options.botPatterns ?? DEFAULT_BOT_PATTERNS;
  const hotfixRegex = options.hotfixRegex ?? DEFAULT_HOTFIX_REGEX;
  const issueKeyRegex = options.issueKeyRegex;

  const authorLogin = node.author?.login ?? '?';
  const created = new Date(node.createdAt);

  let readyAt = created;
  const reviewRequests: ReviewRequestParsed[] = [];
  for (const ev of node.timelineItems.nodes) {
    if (ev.__typename === 'ReadyForReviewEvent') {
      const at = new Date(ev.createdAt);
      if (at > readyAt) readyAt = at;
    } else if (ev.__typename === 'ReviewRequestedEvent') {
      const who = ev.requestedReviewer?.login ?? ev.requestedReviewer?.name;
      if (who) {
        reviewRequests.push({ at: new Date(ev.createdAt), requestedLogin: who });
      }
    }
  }

  const reviews: ReviewParsed[] = [];
  for (const r of node.reviews.nodes) {
    const who = r.author?.login ?? '?';
    if (who === authorLogin) continue;
    if (isBotLogin(who, botPatterns)) continue;
    if (!r.submittedAt || r.state === 'PENDING') continue;
    reviews.push({
      reviewerLogin: who,
      state: r.state,
      submittedAt: new Date(r.submittedAt),
      isBot: false,
    });
  }

  const combinedText = `${node.title} ${node.headRefName ?? ''}`;
  const issueKeys = extractIssueKeys(combinedText, issueKeyRegex);
  const hotfix = hotfixRegex.test(combinedText);

  return {
    id: `${node.repository.name}#${node.number}`,
    repo: node.repository.name,
    number: node.number,
    title: node.title,
    url: node.url,
    state: prState(node),
    isDraft: node.isDraft,
    authorLogin,
    createdAt: created,
    readyAt,
    mergedAt: node.mergedAt ? new Date(node.mergedAt) : null,
    closedAt: node.closedAt ? new Date(node.closedAt) : null,
    mergedByLogin: node.mergedAt ? (node.mergedBy?.login ?? null) : null,
    additions: node.additions,
    deletions: node.deletions,
    changedFiles: node.changedFiles,
    headRef: node.headRefName ?? null,
    issueKeys,
    hotfix,
    reviews,
    reviewRequests,
  };
}
