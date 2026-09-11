import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Role } from '@devboard/shared';
import { api } from './api/client';
import { Nav } from './components/Nav';
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
  children,
}: {
  role: Role | null;
  onLogout: () => void;
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
        <span className="sp" />
        <Nav role={role} onLogout={onLogout} />
      </header>
      {children}
    </>
  );
}

function AppRoutes({ role, setRole }: { role: Role | null; setRole: (r: Role | null) => void }) {
  async function handleLogout() {
    await api.logout().catch(() => undefined);
    setRole(null);
  }

  return (
    <Layout role={role} onLogout={handleLogout}>
      <Routes>
        <Route path="/login" element={<Login onLogin={() => api.me().then((m) => setRole(m.role))} />} />
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

  useEffect(() => {
    api
      .me()
      .then((m) => setRole(m.role))
      .catch(() => setRole(null))
      .finally(() => setChecked(true));
  }, []);

  if (!checked) return null;

  return (
    <BrowserRouter>
      <AppRoutes role={role} setRole={setRole} />
    </BrowserRouter>
  );
}
