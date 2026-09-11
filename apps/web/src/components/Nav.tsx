import { NavLink } from 'react-router-dom';
import type { Role } from '@devboard/shared';

interface NavLinkDef {
  to: string;
  label: string;
  end?: boolean;
}

const PUBLIC_LINKS: NavLinkDef[] = [
  { to: '/', label: 'Inicio', end: true },
  { to: '/corporate', label: 'Corporativo' },
  { to: '/jira', label: 'Entrega' },
  { to: '/github', label: 'Code review' },
  { to: '/people', label: 'Personas' },
  { to: '/initiatives', label: 'Iniciativas' },
  { to: '/epics', label: 'Épicas' },
  { to: '/data', label: 'Datos' },
];

const TL_LINKS: NavLinkDef[] = [
  { to: '/team', label: 'Team' },
  { to: '/settings', label: 'Ajustes' },
];

/** Navegación principal. Muestra enlaces de team-lead solo si `role` es `tl`. */
export function Nav({
  role,
  onLogout,
}: {
  role: Role | null;
  onLogout?: () => void;
}) {
  const links = role === 'tl' ? [...PUBLIC_LINKS, ...TL_LINKS] : PUBLIC_LINKS;
  return (
    <nav className="main-nav">
      {links.map((link) => (
        <NavLink key={link.to} to={link.to} end={link.end ?? false}>
          {link.label}
        </NavLink>
      ))}
      {role ? (
        <button type="button" className="btn sec noprint" onClick={onLogout}>
          Salir
        </button>
      ) : null}
    </nav>
  );
}
