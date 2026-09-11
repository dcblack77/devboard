import { FilterTable, type Column } from './FilterTable';
import { Kpi } from './Kpi';
import { Tag } from './Tag';
import type { RagColor } from './Rag';

type SemColor = 'g' | 'a' | 'r' | '';
const RAG_MAP: Record<Exclude<SemColor, ''>, RagColor> = { g: 'green', a: 'amber', r: 'red' };

interface PersonKpi {
  label: string;
  value: number | string | null;
  sub: string;
  color: SemColor;
}
interface PersonProfileEntry {
  label: string;
  value: number | string | null;
  sub: string;
  comparedToMedian: string;
}
interface PersonSummary {
  kpis: PersonKpi[];
  profile: PersonProfileEntry[];
}

interface WeeklyCount {
  week: string;
  completedByType: Record<string, number>;
  completed: number;
}
interface EpicSummaryForDev {
  key: string;
  summary: string;
  status: string;
  childrenTotal: number;
  childrenByMacro: Record<string, number>;
  pctDone: number;
  mine: Array<{ key: string; type: string; status: string; summary: string }>;
}
interface AttentionIssue {
  key: string;
  type: string;
  summary: string;
  status: string;
  macro: string;
  inStatusHours: number;
  why: string[];
}
interface AnalyzedIssueRow {
  key: string;
  type: string;
  summary: string;
  status: string;
  macro: string;
  done: boolean;
  inStatusHours: number;
}
interface DaysByStateEntry {
  media: number | null;
  max: number;
  n: number;
}
type DaysByStateType = Record<string, Record<string, DaysByStateEntry>>;

interface DevStat {
  dev: string;
  slug: string;
  total: number;
  open: number;
  done: number;
  active: number;
  blockedNow: number;
  throughput4w: number;
  cycleMean: number | null;
  cycleMax: number | null;
  leadMean: number | null;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  daysByStateType: DaysByStateType;
  weekly: WeeklyCount[];
  attention: AttentionIssue[];
  epics: EpicSummaryForDev[];
  issues: AnalyzedIssueRow[];
}

export interface PersonDetailData {
  metrics: { name: string; slug: string };
  summary: PersonSummary;
  devStat?: DevStat;
}

function fmtH(h: number | null): string {
  if (h === null) return '—';
  return h < 24 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} d`;
}

/**
 * Vista de detalle de una persona, compartida por `/team/:slug` (con enlace
 * "Versión para compartir") y `/me/:slug` (sin ese enlace: ya es la vista compartida).
 * No incluye medianas de equipo: eso vive en el ranking de `/team`.
 */
export function PersonDetail({ data, shareUrl }: { data: PersonDetailData; shareUrl?: string }) {
  const { metrics, summary, devStat } = data;

  const attentionColumns: Column<AttentionIssue>[] = [
    { key: 'key', header: 'Issue', accessor: (r) => r.key },
    { key: 'summary', header: 'Resumen', accessor: (r) => r.summary },
    { key: 'type', header: 'Tipo', accessor: (r) => r.type },
    { key: 'status', header: 'Estado', accessor: (r) => r.status, render: (r) => <Tag value={r.macro} label={r.status} /> },
    { key: 'why', header: 'Motivo', accessor: (r) => r.why.join('; '), render: (r) => <span className="why">{r.why.join('; ')}</span> },
  ];

  const issueColumns: Column<AnalyzedIssueRow>[] = [
    { key: 'key', header: 'Issue', accessor: (r) => r.key },
    { key: 'summary', header: 'Resumen', accessor: (r) => r.summary },
    { key: 'type', header: 'Tipo', accessor: (r) => r.type, filterOptions: [...new Set((devStat?.issues ?? []).map((i) => i.type))] },
    { key: 'status', header: 'Estado', accessor: (r) => r.status, render: (r) => <Tag value={r.macro} label={r.status} /> },
    { key: 'done', header: '¿Entregada?', accessor: (r) => (r.done ? 'sí' : 'no') },
  ];

  return (
    <main>
      <h1>{metrics.name}</h1>
      <p className="lead">Detalle individual: entrega, flujo por estado, code review, iniciativas, atención y actividad semanal.</p>
      {shareUrl ? (
        <div className="fbar noprint">
          <a className="btn sec" href={shareUrl} target="_blank" rel="noreferrer">
            Versión para compartir
          </a>
        </div>
      ) : null}

      {/* Bloque 1: entrega */}
      <section>
        <h2>Entrega</h2>
        <div className="kpis">
          {summary.kpis.map((k) => (
            <Kpi key={k.label} value={k.value ?? '—'} label={k.label} sub={k.sub} rag={k.color ? RAG_MAP[k.color] : undefined} />
          ))}
        </div>
      </section>

      {/* Bloque 2: flujo por estado */}
      {devStat ? (
        <section>
          <h2>Flujo por estado</h2>
          <p className="lead">Días acumulados por issue en cada estado, por tipo.</p>
          {Object.entries(devStat.daysByStateType).map(([type, byStatus]) => (
            <div className="card" key={type}>
              <h4>{type}</h4>
              <table>
                <thead>
                  <tr>
                    <th>Estado</th>
                    <th className="n">Media</th>
                    <th className="n">Máx</th>
                    <th className="n">N</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(byStatus).map(([status, e]) => (
                    <tr key={status}>
                      <td>{status}</td>
                      <td className="n">{fmtH(e.media)}</td>
                      <td className="n">{fmtH(e.max)}</td>
                      <td className="n">{e.n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      ) : null}

      {/* Bloque 3: code review (perfil) */}
      <section>
        <h2>Code review</h2>
        <div className="kpis">
          {summary.profile.map((p) => (
            <Kpi key={p.label} value={p.value ?? '—'} label={p.label} sub={`${p.sub}${p.comparedToMedian ? ' · ' + p.comparedToMedian : ''}`} />
          ))}
        </div>
      </section>

      {/* Bloque 4: iniciativas / épicas */}
      {devStat && devStat.epics.length > 0 ? (
        <section>
          <h2>Iniciativas / épicas</h2>
          <div className="grid">
            {devStat.epics.map((e) => (
              <div className="card" key={e.key}>
                <h4>
                  {e.key} — {e.summary}
                </h4>
                <p className="q">
                  {e.pctDone}% completada · {e.mine.length} issues suyas de {e.childrenTotal} totales
                </p>
                <details>
                  <summary>Sus issues en esta épica</summary>
                  <ul className="small">
                    {e.mine.map((m) => (
                      <li key={m.key}>
                        {m.key} — {m.summary} ({m.status})
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Bloque 5: atención */}
      {devStat && devStat.attention.length > 0 ? (
        <section>
          <h2>Requiere atención</h2>
          <FilterTable rows={devStat.attention} columns={attentionColumns} />
        </section>
      ) : null}

      {/* Bloque 6: semanal */}
      {devStat && devStat.weekly.length > 0 ? (
        <section>
          <h2>Actividad semanal</h2>
          <table>
            <thead>
              <tr>
                <th>Semana</th>
                <th className="n">Entregadas</th>
              </tr>
            </thead>
            <tbody>
              {devStat.weekly.map((w) => (
                <tr key={w.week}>
                  <td>{w.week}</td>
                  <td className="n">{w.completed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {/* Detalle plegado: todos los issues */}
      {devStat ? (
        <details className="card">
          <summary>Detalle de issues ({devStat.issues.length})</summary>
          <FilterTable rows={devStat.issues} columns={issueColumns} />
        </details>
      ) : null}
    </main>
  );
}
