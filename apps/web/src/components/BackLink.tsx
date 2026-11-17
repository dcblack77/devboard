/**
 * Link back to the site that hosts the static snapshot (set at build time with
 * `VITE_BACK_URL` / `VITE_BACK_LABEL`). Renders nothing when no url is configured.
 */
export function BackLink({ url, label }: { url: string; label: string }) {
  if (!url) return null;
  return (
    <a href={url} className="back-link noprint">
      ← {label || 'Volver'}
    </a>
  );
}
