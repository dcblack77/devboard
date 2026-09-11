import { describe, expect, it } from 'vitest';
import { filterRows, sortRows, type Column } from '../src/components/FilterTable';

interface Row {
  name: string;
  status: string;
  count: number;
}

const columns: Column<Row>[] = [
  { key: 'name', header: 'Nombre', accessor: (r) => r.name },
  { key: 'status', header: 'Estado', accessor: (r) => r.status, filterOptions: ['abierto', 'cerrado'] },
  { key: 'count', header: 'Cantidad', accessor: (r) => r.count, numeric: true },
];

const rows: Row[] = [
  { name: 'Ana Pérez', status: 'abierto', count: 3 },
  { name: 'Luis Gómez', status: 'cerrado', count: 1 },
  { name: 'Marta Ruiz', status: 'abierto', count: 2 },
];

describe('filterRows', () => {
  it('filtra por texto libre en cualquier columna', () => {
    const result = filterRows(rows, columns, 'luis', {});
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('Luis Gómez');
  });

  it('filtra por valor exacto de columna', () => {
    const result = filterRows(rows, columns, '', { status: 'abierto' });
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.status === 'abierto')).toBe(true);
  });

  it('combina texto libre y filtro de columna', () => {
    const result = filterRows(rows, columns, 'ruiz', { status: 'abierto' });
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('Marta Ruiz');
  });

  it('devuelve todo si no hay filtros', () => {
    expect(filterRows(rows, columns, '', {})).toHaveLength(3);
  });
});

describe('sortRows', () => {
  it('ordena ascendente por columna numérica', () => {
    const result = sortRows(rows, columns, 'count', 'asc');
    expect(result.map((r) => r.count)).toEqual([1, 2, 3]);
  });

  it('ordena descendente por columna numérica', () => {
    const result = sortRows(rows, columns, 'count', 'desc');
    expect(result.map((r) => r.count)).toEqual([3, 2, 1]);
  });

  it('sin sortKey devuelve el orden original', () => {
    expect(sortRows(rows, columns, null, 'asc')).toEqual(rows);
  });
});
