import { FilterTable, type Column } from '../FilterTable';

/** Props de `FilterTable` para el diseño de /github: variante moderna y 20/50/100/Todas filas. */
export const MODERN_TABLE: { variant: 'modern'; pageSizeOptions: number[] } = {
  variant: 'modern',
  pageSizeOptions: [20, 50, 100, 0],
};

/** `FilterTable` con el preset `MODERN_TABLE` ya aplicado. */
export function ModernTable<T>({ rows, columns }: { rows: T[]; columns: Column<T>[] }) {
  return <FilterTable rows={rows} columns={columns} {...MODERN_TABLE} />;
}

export type { Column };
