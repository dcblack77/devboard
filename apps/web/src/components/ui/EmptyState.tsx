import type { ReactNode } from 'react';

/** Estado vacío: caja punteada centrada (`.empty-state`). */
export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="empty-state">{children}</p>;
}
