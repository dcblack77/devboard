import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { Block } from '../components/Block';
import { Kpi } from '../components/Kpi';
import { Rag } from '../components/Rag';
import { IssueKey, IssuePrs } from '../components/IssueLinks';
import { FilterTable, type Column } from '../components/FilterTable';
import { PageShell } from '../components/ui/PageShell';
import { Section } from '../components/ui/Section';
import { KpiGroup } from '../components/ui/KpiGroup';
import { PageSkeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusPill } from '../components/ui/StatusPill';
import { AgeBadge, Avatar } from '../components/ui/cells';
import { MODERN_TABLE } from '../components/ui/tables';
import { TimeSeriesChart } from '../components/ui/TimeSeriesChart';
import { toDelta, windowDelta } from '../lib/deltas';
import { fmtHours } from '../lib/format';
import { ProgressBar } from './Initiatives';

type RagColorShort = 'r' | 'a' | 'g';

interface EpicSummary {
  key: string;
  summary: string;
  status: string;
  childrenTotal: number;
  childrenByMacro: Record<string, number>;
  pctDone: number;
}

interface WeeklyEntry {
  week: string;
  completedByType: Record<string, number>;
  completed: number;
}

interface InitiativeIssue {
  key: string;
  type: string;
  summary: string;
  status: string;
  macro: string;
  assigneeRaw: string | null;
  counted: boolean;
  deliveredAt: string | null;
  inStatusHours: number | null;
}

interface AttentionIssue extends InitiativeIssue {
  why: string[];
}

interface PersonStat {
  dev: string;
  total: number;
  open: number;
  done: number;
}

interface InitiativeDetail {
  name: string;
  slug: string;
  epics: EpicSummary[];
  childrenTotal: number;
  pctDone: number;
  inPeriod: number;
  open: number;
  done: number;
  blockedNow: number;
  throughput4w: number;
  cycleMean: number | null;
  weekly: WeeklyEntry[];
  people: PersonStat[];
  attention: AttentionIssue[];
  issues: InitiativeIssue[];
  rag: { color: RagColorShort; reason: string };
}

interface InitiativesData {
  initiatives: InitiativeDetail;
}

const RAG_MAP: Record<RagColorShort, 'red' | 'amber' | 'green'> = { r: 'red', a: 'amber', g: 'green' };

/** Página Iniciativa: detalle de una iniciativa — épicas, issues del periodo, personas, atención y semanal. */
export function Initiative() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<InitiativeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    api
      .initiative(slug)
      .then((res) => setData((res as unknown as InitiativesData).initiatives))
      .catch(() => setError('No se pudo cargar la iniciativa.'));
  }, [slug]);

  if (error) return <p className="error-msg">{error}</p>;
  if (!data) return <PageSkeleton label="Cargando iniciativa" />;

  const issues = data.issues ?? [];
  const delivered = issues.filter((i) => i.counted && i.deliveredAt);
  const NONE = '(sin asignar)';
  const types = [...new Set(issues.map((i) => i.type))].sort();
  const statuses = [...new Set(issues.map((i) => i.status))].sort();
  const assignees = [...new Set(issues.map((i) => i.assigneeRaw ?? NONE))].sort();

  const person = (name: string | null) => (name ? <Avatar name={name} /> : <span className="muted">{NONE}</span>);

  const epicColumns: Column<EpicSummary>[] = [
    { key: 'key', header: 'Clave', accessor: (r) => r.key, render: (r) => <IssueKey issueKey={r.key} /> },
    { key: 'summary', header: 'Resumen', accessor: (r) => r.summary, cellClass: 'td-title', cellTitle: (r) => r.summary },
    { key: 'status', header: 'Estado', accessor: (r) => r.status, render: (r) => <StatusPill status={r.status} /> },
    { key: 'total', header: 'Elementos', accessor: (r) => r.childrenTotal, numeric: true },
    { key: 'pct', header: 'Avance', accessor: (r) => r.pctDone, numeric: true, render: (r) => <ProgressBar pct={r.pctDone} /> },
  ];

  const attentionColumns: Column<AttentionIssue>[] = [
    { key: 'key', header: 'Clave', accessor: (r) => r.key, render: (r) => <IssueKey issueKey={r.key} /> },
    { key: 'summary', header: 'Resumen', accessor: (r) => r.summary, cellClass: 'td-title', cellTitle: (r) => r.summary },
    { key: 'status', header: 'Estado', accessor: (r) => r.status, render: (r) => <StatusPill status={r.macro} label={r.status} /> },
    { key: 'person', header: 'Persona', accessor: (r) => r.assigneeRaw ?? NONE, cellClass: 'author-cell', render: (r) => person(r.assigneeRaw) },
    { key: 'age', header: 'En el estado', accessor: (r) => r.inStatusHours ?? -1, numeric: true, render: (r) => <AgeBadge hours={r.inStatusHours} /> },
    { key: 'why', header: 'Motivo', accessor: (r) => r.why.join(' · '), cellClass: 'td-title', cellTitle: (r) => r.why.join(' · ') },
    { key: 'prs', header: 'PR', accessor: (r) => r.key, render: (r) => <IssuePrs issueKey={r.key} /> },
  ];

  const peopleColumns: Column<PersonStat>[] = [
    { key: 'dev', header: 'Persona', accessor: (r) => r.dev, cellClass: 'author-cell', render: (r) => <Avatar name={r.dev} /> },
    { key: 'total', header: 'Total', accessor: (r) => r.total, numeric: true },
    { key: 'open', header: 'Abiertos', accessor: (r) => r.open, numeric: true },
    { key: 'done', header: 'Entregados', accessor: (r) => r.done, numeric: true },
  ];

  const issueColumns: Column<InitiativeIssue>[] = [
    { key: 'key', header: 'Clave', accessor: (r) => r.key, render: (r) => <IssueKey issueKey={r.key} /> },
    { key: 'type', header: 'Tipo', accessor: (r) => r.type, filterOptions: types },
    { key: 'summary', header: 'Resumen', accessor: (r) => r.summary, cellClass: 'td-title', cellTitle: (r) => r.summary },
    { key: 'status', header: 'Estado', accessor: (r) => r.status, filterOptions: statuses, render: (r) => <StatusPill status={r.macro} label={r.status} /> },
    { key: 'person', header: 'Persona', accessor: (r) => r.assigneeRaw ?? NONE, filterOptions: assignees, cellClass: 'author-cell', render: (r) => person(r.assigneeRaw) },
    { key: 'age', header: 'En el estado', accessor: (r) => r.inStatusHours ?? -1, numeric: true, render: (r) => <AgeBadge hours={r.inStatusHours} /> },
  ];

  return (
    <PageShell
      title={data.name}
      lead={<Rag color={RAG_MAP[data.rag.color]} text={`${data.pctDone}% completado — ${data.rag.reason}`} />}
      actions={<Link to="/initiatives" className="btn sec">← Iniciativas</Link>}
    >
      <Block title="Resumen" plain>
        <KpiGroup label="Volumen">
          <Kpi value={data.childrenTotal} label="Elementos totales" />
          <Kpi value={data.inPeriod} label="En periodo" />
          <Kpi value={data.open} label="Abiertos" />
          <Kpi value={data.done} label="Entregados" />
        </KpiGroup>
        <KpiGroup label="Ritmo">
          <Kpi
            value={data.throughput4w}
            label="Entregado · 4 sem"
            title="Elementos entregados en las últimas 4 semanas"
            delta={toDelta(windowDelta(data.weekly, 'completed', 4), 'up')}
          />
          <Kpi value={fmtHours(data.cycleMean)} label="Tiempo de ciclo (media)" />
          <Kpi value={data.blockedNow} label="Bloqueados ahora" edge={data.blockedNow > 0 ? 'red' : undefined} />
        </KpiGroup>
      </Block>

      <TimeSeriesChart
        items={delivered}
        date={(i) => i.deliveredAt}
        label="Entregado"
        unit="entregados"
        title={(noun) => `Entregas por ${noun}`}
        storageKey="devboard.initiative.chart"
      />

      <Section pageKey="initiative" id="epics" title="Épicas" count={data.epics.length}>
        {data.epics.length === 0 ? <EmptyState>Esta iniciativa no tiene épicas.</EmptyState> : <FilterTable rows={data.epics} columns={epicColumns} {...MODERN_TABLE} />}
      </Section>

      <Section pageKey="initiative" id="attention" title="Requieren atención" count={data.attention.length}>
        {data.attention.length === 0 ? <EmptyState>Nada requiere atención 🎉</EmptyState> : <FilterTable rows={data.attention} columns={attentionColumns} {...MODERN_TABLE} />}
      </Section>

      <Section pageKey="initiative" id="people" title="Personas" count={data.people.length}>
        {data.people.length === 0 ? <EmptyState>Sin personas asignadas.</EmptyState> : <FilterTable rows={data.people} columns={peopleColumns} {...MODERN_TABLE} />}
      </Section>

      <Section pageKey="initiative" id="issues" title="Issues" count={issues.length} defaultOpen={false}>
        {issues.length === 0 ? <EmptyState>No hay issues en el periodo.</EmptyState> : <FilterTable rows={issues} columns={issueColumns} {...MODERN_TABLE} />}
      </Section>
    </PageShell>
  );
}
