import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { PersonDetail, type PersonDetailData } from '../components/PersonDetail';
import { PrintButton } from '../components/PrintButton';

/** Página `/team/:slug`: detalle completo de una persona, con enlace "Versión para compartir" hacia `/me/:slug`. */
export function TeamPerson() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<PersonDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    api
      .teamMember(slug)
      .then((res) => setData(res as unknown as PersonDetailData))
      .catch(() => setError('No se pudo cargar el detalle de esta persona.'));
  }, [slug]);

  if (error) return <p className="error-msg">{error}</p>;
  if (!data) return <p className="muted">Cargando…</p>;

  return (
    <>
      <PrintButton />
      <PersonDetail data={data} shareUrl={`/me/${slug}`} />
    </>
  );
}
