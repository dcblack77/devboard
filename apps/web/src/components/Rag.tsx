export type RagColor = 'red' | 'amber' | 'green';

/** Punto de color rojo/ámbar/verde acompañado de un texto explicativo. */
export function Rag({ color, text }: { color: RagColor; text: string }) {
  return (
    <span>
      <span className={`rag-dot ${color}`} aria-hidden="true" />
      {text}
    </span>
  );
}
