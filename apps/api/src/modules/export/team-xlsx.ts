/**
 * Construcción pura del workbook Excel de exportación del equipo (exceljs, en memoria).
 * Puerto de `team_xlsx()` de `render_v4.py`: mismas hojas y columnas, en llano, días/horas
 * (nunca percentiles). Recibe el `MetricsContext` completo y sus métricas ya calculadas
 * (`PersonMetrics[]`, `TeamMedians`) y no toca la DB.
 */
import ExcelJS from 'exceljs';
import type { AnalyzedIssue } from '../../domain/metrics/issues.js';
import type { AnalyzedPr } from '../../domain/metrics/github.js';
import type { InitiativeStat, RagColor } from '../../domain/metrics/initiatives.js';
import { ragInitiative } from '../../domain/metrics/initiatives.js';
import type { PersonMetrics, TeamMedians } from '../../domain/metrics/team.js';
import type { HomeSummary } from '../../domain/metrics/home.js';

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EDF5' } };
const RED_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE2E2' } };
const GREEN_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDF5E3' } };
const AMBER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };

const RAG_FILL: Record<RagColor, ExcelJS.Fill> = { r: RED_FILL, a: AMBER_FILL, g: GREEN_FILL };

function addSheet(
  wb: ExcelJS.Workbook,
  title: string,
  headers: string[],
  rows: Array<Array<string | number | null>>,
  widths?: number[],
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(title.slice(0, 31));
  ws.addRow(headers);
  const headerRow = ws.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.alignment = { wrapText: true, vertical: 'top' };
  });
  for (const row of rows) ws.addRow(row);
  headers.forEach((h, i) => {
    const width = widths?.[i] ?? Math.max(12, Math.min(40, h.length + 2));
    ws.getColumn(i + 1).width = width;
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  return ws;
}

function round1(v: number | null): number | null {
  return v === null ? null : Math.round(v * 10) / 10;
}

/** Redondea horas a días con un decimal, o `null`. */
function hoursToDays(h: number | null): number | null {
  return h === null ? null : Math.round((h / 24) * 10) / 10;
}

export interface TeamXlsxInput {
  home: HomeSummary;
  peopleMetrics: PersonMetrics[];
  medians: TeamMedians;
  initiativesList: InitiativeStat[];
  issues: AnalyzedIssue[];
  prs: AnalyzedPr[];
  periodo: string;
}

/**
 * Construye el workbook completo de exportación: Resumen equipo, Ranking, una hoja por
 * persona, Iniciativas, Issues y (si hay PRs) PRs. Devuelve el `Workbook` de exceljs listo
 * para `writeBuffer()`.
 */
export function buildTeamWorkbook(input: TeamXlsxInput): ExcelJS.Workbook {
  const { home, peopleMetrics, medians, initiativesList, issues, prs, periodo } = input;
  const wb = new ExcelJS.Workbook();
  const g = home.numbers.github;

  // ---- Resumen equipo ----
  addSheet(
    wb,
    'Resumen equipo',
    ['Métrica', 'Valor', 'Nota'],
    [
      ['Periodo', periodo, ''],
      ['Personas', home.numbers.people, ''],
      ['Entregadas esta semana', home.numbers.lastWeek, home.numbers.avg4 !== null ? `media 4 sem ${round1(home.numbers.avg4)}` : ''],
      ['Entregadas 4 semanas', home.numbers.delivered4w, `${home.numbers.bugs4w} errores / ${home.numbers.feat4w} funcionalidad`],
      ['Entregadas en el periodo', home.numbers.delivered, ''],
      ['Días para entregar (media)', hoursToDays(home.numbers.cycleMean), 'En curso → entregada'],
      ['Issues abiertas', home.numbers.open, ''],
      ['Bloqueadas', home.numbers.blocked, `${home.numbers.blocked5d} más de 5 días`],
      ['Paradas > 7 días', home.numbers.aged, ''],
      ['PRs mergeadas 4 semanas', g?.merged4w ?? null, g ? `${g.hotfix4w} hotfix` : ''],
      ['Horas hasta 1ª review (media)', round1(g?.firstReview ?? null), ''],
      ['Horas hasta merge (media)', round1(g?.toMerge ?? null), ''],
      ['PRs esperando review > 48 h', g?.waiting ?? null, ''],
      ['PRs mergeadas sin aprobación', g?.noApproval ?? null, g ? `${g.pctNoApproval}%` : ''],
    ],
    [34, 16, 40],
  );

  // ---- Ranking ----
  const rankHeaders = [
    'Persona', 'Entregadas', 'Entregadas 4 sem', 'PRs mergeadas', 'Reviews', 'Balance (reviews/PRs)',
    'PRs revisadas', 'Pide cambios', 'Autores revisados', 'Responde en (h)', 'Sus PRs: 1ª review (h)',
    'Sus PRs: merge (h)', 'Sin aprobación', 'PRs > 7 días', 'Bloqueadas', 'Atención', 'Días para entregar',
    'Hotfix', 'Tipo dominante',
  ];
  const sortedByReviews = [...peopleMetrics].sort((a, b) => b.reviews - a.reviews);
  const rankRows = sortedByReviews.map((m) => [
    m.name, m.delivered, m.delivered4w, m.prsMerged, m.reviews, m.ratio, m.prsReviewed, m.changesRequested,
    m.authorsReviewed, round1(m.responseH), round1(m.firstReviewH), round1(m.toMergeH), m.noApproval,
    m.open7d, m.blocked, m.attention, m.cycleDays, m.hotfix, m.dominant,
  ]);
  const rankSheet = addSheet(wb, 'Ranking', rankHeaders, rankRows, [22, ...Array(18).fill(13)]);
  rankSheet.addRow([]);
  rankSheet.addRow([
    'Mediana equipo', medians.delivered, null, medians.prsMerged, medians.reviews, medians.ratio, null, null,
    medians.authorsReviewed, round1(medians.responseH), round1(medians.firstReviewH),
  ]);
  for (let r = 0; r < rankRows.length; r += 1) {
    const excelRow = r + 2;
    const ratio = rankRows[r]![5] as number | null;
    if (ratio !== null) {
      const fill = ratio < 0.5 ? RED_FILL : ratio < 0.8 ? AMBER_FILL : GREEN_FILL;
      rankSheet.getCell(excelRow, 6).fill = fill;
    }
    const noApproval = rankRows[r]![12] as number;
    if (noApproval) rankSheet.getCell(excelRow, 13).fill = RED_FILL;
    const open7d = (rankRows[r]![13] as number) ?? 0;
    if (open7d >= 3) rankSheet.getCell(excelRow, 14).fill = RED_FILL;
    const blocked = rankRows[r]![14] as number;
    if (blocked) rankSheet.getCell(excelRow, 15).fill = RED_FILL;
  }

  // ---- Una hoja por persona ----
  for (const m of sortedByReviews) {
    addSheet(
      wb,
      m.name,
      ['Métrica', 'Valor', 'Mediana equipo'],
      [
        ['Entregadas', m.delivered, medians.delivered],
        ['Entregadas 4 semanas', m.delivered4w, null],
        ['Abiertas ahora', m.open, null],
        ['Bloqueadas ahora', m.blocked, null],
        ['Necesitan atención', m.attention, null],
        ['Días para entregar (media)', m.cycleDays, medians.cycleDays],
        ['PRs abiertas por él/ella', m.prs, null],
        ['PRs mergeadas', m.prsMerged, medians.prsMerged],
        ['PRs mergeadas 4 semanas', m.prs4w, null],
        ['Hotfix', m.hotfix, null],
        ['Sus PRs: horas hasta 1ª review', round1(m.firstReviewH), round1(medians.firstReviewH)],
        ['Sus PRs: horas hasta merge', round1(m.toMergeH), null],
        ['PRs mergeadas sin aprobación', m.noApproval, null],
        ['PRs abiertas > 7 días', m.open7d, null],
        ['Reviews hechas', m.reviews, medians.reviews],
        ['PRs revisadas', m.prsReviewed, null],
        ['Aprueba', m.approvals, null],
        ['Pide cambios', m.changesRequested, null],
        ['Autores distintos revisados', m.authorsReviewed, medians.authorsReviewed],
        ['Responde a una PR en (h)', round1(m.responseH), round1(medians.responseH)],
        ['Balance reviews ÷ PRs', m.ratio, medians.ratio],
        ['Tipo de trabajo dominante', m.dominant, null],
        ['Mezcla', Object.entries(m.mix).map(([k, v]) => `${k} ${v}%`).join(' · '), null],
      ],
      [34, 16, 16],
    );
  }

  // ---- Iniciativas ----
  addSheet(
    wb,
    'Iniciativas',
    ['Iniciativa', 'Épicas', 'Historias/tareas', '% entregado', 'Cerradas', 'Entregadas', 'En marcha', 'Bloqueadas', 'Pendientes', 'Entregadas 4 sem', 'Semáforo'],
    initiativesList.map((i) => {
      const rag = ragInitiative(i);
      const ragLabel = { g: 'verde', a: 'ámbar', r: 'rojo' }[rag.color];
      return [
        i.name, i.epics.length, i.childrenTotal, i.pctDone,
        i.childrenByMacro['cerrada'] ?? 0, i.childrenByMacro['entregada'] ?? 0,
        i.childrenByMacro['en_marcha'] ?? 0, i.childrenByMacro['bloqueada'] ?? 0,
        i.childrenByMacro['pendiente'] ?? 0, i.throughput4w, ragLabel,
      ];
    }),
    [30, ...Array(10).fill(13)],
  ).eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const initiative = initiativesList[rowNum - 2];
    if (!initiative) return;
    const rag = ragInitiative(initiative);
    row.getCell(11).fill = RAG_FILL[rag.color];
  });

  // ---- Issues ----
  addSheet(
    wb,
    'Issues',
    ['Clave', 'Tipo', 'Resumen', 'Persona', 'Estado', 'Días en estado', 'Creada', 'Días para entregar', 'Épica'],
    issues
      .filter((r) => r.type !== 'Epic')
      .map((r) => [
        r.key, r.type, r.summary, r.assigneeRaw ?? '(sin asignar)', r.status,
        r.status !== 'Finalizada' ? round1(r.inStatusHours / 24) : null,
        r.created.toISOString().slice(0, 10),
        r.cycleHours ? round1(r.cycleHours / 24) : null,
        r.epicKey ?? '',
      ]),
    [10, 10, 60, 20, 16, 12, 12, 12, 30],
  );

  // ---- PRs (si hay) ----
  if (prs.length > 0) {
    addSheet(
      wb,
      'PRs',
      ['Repo', 'PR', 'Título', 'Autor', 'Estado', 'Revisores', 'Horas hasta 1ª review', 'Horas hasta merge', 'Líneas', 'Sin aprobación', 'Hotfix', 'Claves ERF', 'Creada'],
      prs.map((p) => [
        p.repo, p.number, p.title, p.author, p.state, p.reviewers.join(', '),
        round1(p.hFirstReview), round1(p.hToMerge), p.size,
        p.selfMergedNoApproval ? 'sí' : '', p.hotfix ? 'sí' : '',
        p.issueKeys.join(' '), p.created.toISOString().slice(0, 10),
      ]),
      [30, 8, 60, 20, 14, 30, 12, 12, 10, 10, 8, 16, 12],
    );
  }

  return wb;
}
