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

/** Tabla genérica con filtro de texto libre, filtros por columna, orden y paginación simple. */
export function FilterTable<T>({ rows, columns }: { rows: T[]; columns: Column<T>[] }) {
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

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const paged = sorted.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

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
      <div className="fbar noprint">
        <input
          type="text"
          placeholder="Buscar..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        {columns
          .filter((c) => c.filterOptions)
          .map((col) => (
            <select
              key={col.key}
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
      </table>
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
      </div>
    </div>
  );
}
