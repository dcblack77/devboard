/** Botón que dispara la impresión del navegador (usado con el CSS `@media print`). */
export function PrintButton() {
  return (
    <button type="button" className="btn sec noprint" onClick={() => window.print()}>
      Imprimir / PDF
    </button>
  );
}
