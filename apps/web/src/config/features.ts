/**
 * Interruptores de interfaz. Cambiar aquí y reconstruir la imagen.
 *
 * `teamShortcut`: botón "Equipo" destacado en la cabecera. Es un atajo de trabajo para el TL;
 * pensado para quitarse (poner a `false`) antes de enseñar el tablero a terceros. La ruta
 * `/team` sigue protegida por rol `tl` con o sin el botón.
 */
export const FEATURES = {
  teamShortcut: true,
} as const;
