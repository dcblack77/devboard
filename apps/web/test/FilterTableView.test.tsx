// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FilterTable, type Column } from '../src/components/FilterTable';

interface Row {
  name: string;
  status: string;
}

const columns: Column<Row>[] = [
  { key: 'name', header: 'Nombre', accessor: (r) => r.name },
  { key: 'status', header: 'Estado', accessor: (r) => r.status, filterOptions: ['abierto', 'cerrado'] },
];

const rows: Row[] = Array.from({ length: 130 }, (_, i) => ({ name: `fila ${i}`, status: i % 2 ? 'abierto' : 'cerrado' }));

const bodyRows = (c: HTMLElement) => c.querySelectorAll('tbody tr').length;

describe('FilterTable (render)', () => {
  afterEach(cleanup);

  it('por defecto mantiene 20 filas, sin selector de tamaño ni barra moderna', () => {
    const { container } = render(<FilterTable rows={rows} columns={columns} />);
    expect(bodyRows(container)).toBe(20);
    expect(screen.queryByLabelText('Filas por página')).toBeNull();
    expect(container.querySelector('.fbar-modern')).toBeNull();
    expect(screen.getByText('Página 1 de 7')).toBeTruthy();
  });

  it('con pageSizeOptions permite 20 / 50 / 100 / Todas', () => {
    const { container } = render(<FilterTable rows={rows} columns={columns} pageSizeOptions={[20, 50, 100, 0]} />);
    const sel = screen.getByLabelText('Filas por página') as HTMLSelectElement;
    expect(sel.value).toBe('20');
    expect([...sel.options].map((o) => o.textContent)).toEqual(['20', '50', '100', 'Todas']);
    expect(bodyRows(container)).toBe(20);

    fireEvent.change(sel, { target: { value: '50' } });
    expect(bodyRows(container)).toBe(50);
    expect(screen.getByText('Página 1 de 3')).toBeTruthy();

    fireEvent.change(sel, { target: { value: '0' } });
    expect(bodyRows(container)).toBe(130);
    expect(screen.getByText('Página 1 de 1')).toBeTruthy();
  });

  it('al cambiar el tamaño vuelve a la primera página', () => {
    const { container } = render(<FilterTable rows={rows} columns={columns} pageSizeOptions={[20, 50]} />);
    fireEvent.click(screen.getByText('Siguiente'));
    expect(screen.getByText('Página 2 de 7')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Filas por página'), { target: { value: '50' } });
    expect(screen.getByText('Página 1 de 3')).toBeTruthy();
    expect(container.querySelector('tbody td')!.textContent).toBe('fila 0');
  });

  it('variant modern pinta buscador con icono y filtros en píldora', () => {
    const { container } = render(<FilterTable rows={rows} columns={columns} variant="modern" />);
    const bar = container.querySelector('.fbar.fbar-modern')!;
    expect(bar).toBeTruthy();
    expect(bar.querySelector('.fsearch svg')).toBeTruthy();
    expect(screen.getByLabelText('Buscar')).toBeTruthy();
    expect(bar.querySelectorAll('select.pill')).toHaveLength(1);
    expect(bar.querySelector('.cnt')!.textContent).toBe('130 filas');
  });

  it('sin variant la tabla no lleva clases ni títulos de la variante moderna', () => {
    const cols: Column<Row>[] = [
      { key: 'name', header: 'Nombre', accessor: (r) => r.name, cellTitle: (r) => r.name, cellClass: 'x', align: 'center' },
    ];
    const { container } = render(<FilterTable rows={rows.slice(0, 1)} columns={cols} />);
    expect(container.querySelector('table')!.outerHTML).toBe(
      '<table><thead><tr><th style="cursor: pointer;">Nombre</th></tr></thead><tbody><tr><td>fila 0</td></tr></tbody></table>',
    );
  });

  it('variant moderna: clase ft-modern, centrado, clase y title de celda', () => {
    const cols: Column<Row>[] = [
      { key: 'name', header: 'Nombre', accessor: (r) => r.name, cellTitle: (r) => r.name, cellClass: 'x', align: 'center' },
    ];
    const { container } = render(<FilterTable rows={rows.slice(0, 1)} columns={cols} variant="modern" />);
    expect(container.querySelector('table')!.className).toBe('ft-modern');
    const td = container.querySelector('tbody td')!;
    expect(td.className).toBe('c x');
    expect(td.getAttribute('title')).toBe('fila 0');
  });
});
