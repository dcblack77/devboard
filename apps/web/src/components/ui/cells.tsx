import { fmtHours } from '../../lib/format';

/** Antigüedad en horas → texto: «x h» (< 24 h), «3.5 d» (≤ 10 d) o «165 d» (> 10 d). */
export function fmtAge(h: number | null | undefined): string {
  if (h === null || h === undefined || Number.isNaN(h)) return '—';
  if (h / 24 > 10) return `${Math.round(h / 24)} d`;
  return fmtHours(h);
}

/** Nivel de urgencia por antigüedad: < 7 d neutro, 7–30 d ámbar, > 30 d rojo. */
export function ageLevel(h: number | null | undefined): 'age-new' | 'age-mid' | 'age-old' {
  const d = (h ?? 0) / 24;
  if (d > 30) return 'age-old';
  if (d >= 7) return 'age-mid';
  return 'age-new';
}

/** Iniciales (máx. 2) de un nombre o login: «Ana García» → «AG», «alice» → «AL». */
export function initials(name: string): string {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

/** Badge de antigüedad coloreado (neutro / ámbar ≥ 7 d / rojo > 30 d). */
export function AgeBadge({ hours }: { hours: number | null | undefined }) {
  return <span className={`age-badge ${ageLevel(hours)}`}>{fmtAge(hours)}</span>;
}

/** Círculo con iniciales seguido del nombre (envuélvelo en `<td className="author-cell">`). */
export function Avatar({ name }: { name: string }) {
  return (
    <>
      <span className="avatar" aria-hidden="true">
        {initials(name)}
      </span>
      {name}
    </>
  );
}

/** Celda `<td>` de PR en dos líneas: «#n título» (enlace, ellipsis) y repo debajo. */
export function PrCell({ repo, number, title, url }: { repo: string; number: number; title?: string | null; url: string }) {
  return (
    <td className="pr-cell">
      {title ? (
        <>
          <a href={url} target="_blank" rel="noreferrer" className="pr-line1" title={`${repo} #${number} · ${title}`}>
            <span className="pr-num">#{number}</span> {title}
          </a>
          <span className="pr-repo">{repo}</span>
        </>
      ) : (
        <a href={url} target="_blank" rel="noreferrer" className="pr-line1" title={`${repo} #${number}`}>
          {repo} <span className="pr-num">#{number}</span>
        </a>
      )}
    </td>
  );
}
