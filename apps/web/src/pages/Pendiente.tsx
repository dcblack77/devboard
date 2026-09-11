/** Página de relleno para rutas aún no implementadas. */
export function Pendiente({ title }: { title: string }) {
  return (
    <main>
      <h1>{title}</h1>
      <p className="lead">Esta página está pendiente de implementación.</p>
    </main>
  );
}
