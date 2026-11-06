import { useMemo, useState } from 'react';
import { EmptyState } from './ui/EmptyState';

/** Minúsculas y sin acentos, para comparar nombres. */
export function normalizeName(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/** Estado del buscador de persona + lista filtrada por nombre (sin mayúsculas ni acentos). */
export function usePersonFilter<T extends { name: string }>(items: T[]) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = normalizeName(query);
    return q ? items.filter((p) => normalizeName(p.name).includes(q)) : items;
  }, [items, query]);
  return { query, setQuery, filtered };
}

/** Caja de búsqueda de persona (look de `.fsearch`) con recuento «N persona(s)». */
export function PersonSearch({ value, onChange, count }: { value: string; onChange: (v: string) => void; count: number }) {
  return (
    <div className="fbar fbar-modern noprint person-search">
      <label className="fsearch">
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input type="search" aria-label="Buscar persona" placeholder="Buscar persona…" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
      <span className="cnt">{count === 1 ? '1 persona' : `${count} personas`}</span>
    </div>
  );
}

export function NoPersonMatch() {
  return <EmptyState>Ninguna persona coincide con la búsqueda.</EmptyState>;
}
