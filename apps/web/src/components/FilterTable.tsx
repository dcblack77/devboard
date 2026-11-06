import { useMemo, useState } from 'react';

/** Definición de una columna de `FilterTable`. */
export interface Column<T> {
  key: string;
  header: string;
  /** Extrae el valor de texto a mostrar y a usar en filtros/orden. */
  accessor: (row: T) => string | number;
  /** Si se define, la columna muestra un `<select>` con estas opciones en la barra de filtros. */
  filterOptions?: string[];
  /** Renderizado alternativo de la celda (por defecto se usa el valor de `accessor`). */
  render?: (row: T) => React.ReactNode;
  numeric?: boolean;
}

/**
 * Aplica el filtro de texto libre y los filtros por columna a un conjunto de filas.
 * Función pura, exportada para poder testearla sin montar React.
 */
export function filterRows<T>(
  rows: T[],
  columns: Column<T>[],
  query: string,
  columnFilters: Record<string, string>,
): T[] {
  const q = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (q) {
      const matches = columns.some((col) => String(col.accessor(row)).toLowerCase().includes(q));
      if (!matches) return false;
    }
    for (const col of columns) {
      const filterValue = columnFilters[col.key];
      if (filterValue && String(col.accessor(row)) !== filterValue) {
        return false;
      }
    }
    return true;
  });
}

/** Ordena filas por la columna y dirección dadas. Función pura. */
export function sortRows<T>(
  rows: T[],
  columns: Column<T>[],
  sortKey: string | null,
  sortDir: 'asc' | 'desc',
): T[] {
  if (!sortKey) return rows;
  const col = columns.find((c) => c.key === sortKey);
  if (!col) return rows;
  const sorted = [...rows].sort((a, b) => {
    const av = col.accessor(a);
    const bv = col.accessor(b);
    if (av < bv) return -1;
    if (av > bv) return 1;
    return 0;
  });
  return sortDir === 'asc' ? sorted : sorted.reverse();
}

const PAGE_SIZE = 20;

/**
 * Tabla genérica con filtro de texto libre, filtros por columna, orden y paginación simple.
 *
 * Opcionales (sin ellos el comportamiento es el de siempre):
 * - `pageSizeOptions`: tamaños elegibles en un selector (`0` = todas); el primero es el inicial.
 * - `variant="modern"`: barra a todo el ancho con buscador con icono y filtros en píldora.
 */
export function FilterTable<T>({
  rows,
  columns,
  pageSizeOptions,
  variant,
}: {
  rows: T[];
  columns: Column<T>[];
  pageSizeOptions?: number[];
  variant?: 'modern';
}) {
  const modern = variant === 'modern';
  const [pageSize, setPageSize] = useState<number>(pageSizeOptions?.[0] ?? PAGE_SIZE);
  const [query, setQuery] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);

  const filtered = useMemo(
    () => filterRows(rows, columns, query, columnFilters),
    [rows, columns, query, columnFilters],
  );
  const sorted = useMemo(
    () => sortRows(filtered, columns, sortKey, sortDir),
    [filtered, columns, sortKey, sortDir],
  );

  const size = pageSize > 0 ? pageSize : Math.max(1, sorted.length);
  const pageCount = Math.max(1, Math.ceil(sorted.length / size));
  const currentPage = Math.min(page, pageCount - 1);
  const paged = sorted.slice(currentPage * size, (currentPage + 1) * size);

  /** En la variante moderna la tabla hace scroll horizontal dentro de su contenedor (móvil). */
  const wrapTable = (table: React.ReactNode) => (modern ? <div className="ft-scroll">{table}</div> : table);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(0);
  }

  return (
    <div>
      <div className={modern ? 'fbar fbar-modern noprint' : 'fbar noprint'}>
        {modern ? (
          <label className="fsearch">
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              aria-label="Buscar"
              placeholder="Buscar..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          </label>
        ) : (
          <input
            type="text"
            placeholder="Buscar..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        )}
        {columns
          .filter((c) => c.filterOptions)
          .map((col) => (
            <select
              key={col.key}
              className={modern ? 'pill' : undefined}
              aria-label={modern ? col.header : undefined}
              value={columnFilters[col.key] ?? ''}
              onChange={(e) => {
                setColumnFilters((prev) => ({ ...prev, [col.key]: e.target.value }));
                setPage(0);
              }}
            >
              <option value="">{col.header}: todos</option>
              {col.filterOptions!.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ))}
        <span className="cnt">{sorted.length} filas</span>
      </div>
      {wrapTable(
      <table>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={col.numeric ? 'n' : undefined}
                onClick={() => toggleSort(col.key)}
                style={{ cursor: 'pointer' }}
              >
                {col.header}
                {sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paged.map((row, i) => (
            <tr key={i}>
              {columns.map((col) => (
                <td key={col.key} className={col.numeric ? 'n' : undefined}>
                  {col.render ? col.render(row) : col.accessor(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>,
      )}
      <div className="pager noprint">
        <button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
          Anterior
        </button>
        <span>
          Página {currentPage + 1} de {pageCount}
        </span>
        <button disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>
          Siguiente
        </button>
        {pageSizeOptions ? (
          <label className="psize">
            Filas por página
            <select
              aria-label="Filas por página"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(0);
              }}
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n > 0 ? n : 'Todas'}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </div>
  );
}
