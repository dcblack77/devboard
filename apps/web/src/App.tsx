import { useCallback, useEffect, useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Role } from '@devboard/shared';
import { api } from './api/client';
import { Nav } from './components/Nav';
import { SyncButton } from './components/SyncButton';
import { FEATURES } from './config/features';
import { Login } from './pages/Login';
import { Home } from './pages/Home';
import { Corporate } from './pages/Corporate';
import { Team } from './pages/Team';
import { TeamPerson } from './pages/TeamPerson';
import { Me } from './pages/Me';
import { Settings } from './pages/Settings';
import { Jira } from './pages/Jira';
import { Github } from './pages/Github';
import { People } from './pages/People';
import { Initiatives } from './pages/Initiatives';
import { Initiative } from './pages/Initiative';
import { Epics } from './pages/Epics';
import { Data } from './pages/Data';

/** Layout público con cabecera y navegación; se omite en `/login` y `/me/:slug`. */
function Layout({
  role,
  onLogout,
  onDataUpdated,
  authDisabled,
  children,
}: {
  role: Role | null;
  onLogout: () => void;
  onDataUpdated: () => void;
  authDisabled: boolean;
  children: React.ReactNode;
}) {
  const location = useLocation();
  const bare = location.pathname === '/login' || location.pathname.startsWith('/me/');
  if (bare) return <>{children}</>;
  return (
    <>
      <header>
        <h1>DevBoard</h1>
        <span className="sub">Métricas del equipo</span>
        {FEATURES.teamShortcut ? (
          <Link to="/team" className="btn team-shortcut noprint">
            Equipo
          </Link>
        ) : null}
        <span className="sp" />
        <SyncButton role={role} onUpdated={onDataUpdated} />
        <Nav role={role} onLogout={onLogout} authDisabled={authDisabled} />
      </header>
      {children}
    </>
  );
}

function AppRoutes({
  role,
  setRole,
  authDisabled,
}: {
  role: Role | null;
  setRole: (r: Role | null) => void;
  authDisabled: boolean;
}) {
  async function handleLogout() {
    await api.logout().catch(() => undefined);
    setRole(null);
  }

  // Al terminar una actualización de datos se incrementa y las páginas se vuelven a montar,
  // pidiendo de nuevo sus datos a la API.
  const [dataVersion, setDataVersion] = useState(0);
  const handleDataUpdated = useCallback(() => setDataVersion((v) => v + 1), []);

  return (
    <Layout role={role} onLogout={handleLogout} onDataUpdated={handleDataUpdated} authDisabled={authDisabled}>
      <Routes key={dataVersion}>
        <Route
          path="/login"
          element={
            authDisabled ? (
              <Navigate to="/" replace />
            ) : (
              <Login onLogin={() => api.me().then((m) => setRole(m.role))} />
            )
          }
        />
        <Route path="/" element={<Home />} />
        <Route path="/corporate" element={<Corporate />} />
        <Route path="/jira" element={<Jira />} />
        <Route path="/github" element={<Github />} />
        <Route path="/people" element={<People />} />
        <Route path="/initiatives" element={<Initiatives />} />
        <Route path="/initiatives/:slug" element={<Initiative />} />
        <Route path="/epics" element={<Epics />} />
        <Route path="/data" element={<Data />} />
        <Route path="/team" element={<Team />} />
        <Route path="/team/:slug" element={<TeamPerson />} />
        <Route path="/me/:slug" element={<Me />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

/** Raíz de la aplicación: comprueba la sesión y monta el router. */
export default function App() {
  const [role, setRole] = useState<Role | null>(null);
  const [checked, setChecked] = useState(false);
  const [authDisabled, setAuthDisabled] = useState(false);

  useEffect(() => {
    api
      .me()
      .then((m) => {
        setRole(m.role);
        setAuthDisabled(m.authDisabled ?? false);
      })
      .catch(() => setRole(null))
      .finally(() => setChecked(true));
  }, []);

  if (!checked) return null;

  return (
    <BrowserRouter>
      <AppRoutes role={role} setRole={setRole} authDisabled={authDisabled} />
    </BrowserRouter>
  );
}
