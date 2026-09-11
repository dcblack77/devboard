import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { PersonDetail, type PersonDetailData } from '../components/PersonDetail';
import { PrintButton } from '../components/PrintButton';

/**
 * Página `/me/:slug`: versión "para compartir" del detalle de una persona.
 * Sin cabecera/navegación (lo gestiona `App.tsx`), sin medianas de equipo
 * (la API de `/api/me/:slug` no las incluye) y sin nombres de otras personas:
 * solo se muestran los datos propios de `devStat`/`metrics` de esta persona.
 */
export function Me() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<PersonDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    api
      .me_(slug)
      .then((res) => setData(res as unknown as PersonDetailData))
      .catch(() => setError('No se pudo cargar esta vista.'));
  }, [slug]);

  if (error) return <p className="error-msg">{error}</p>;
  if (!data) return <p className="muted">Cargando…</p>;

  return (
    <>
      <PrintButton />
      <PersonDetail data={data} />
    </>
  );
}
