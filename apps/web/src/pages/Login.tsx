import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';

/** Página de login: pide la contraseña y llama a `POST /api/auth/login`. */
export function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.login({ password });
      onLogin();
      navigate('/');
    } catch (err) {
      if (err instanceof ApiError) {
        setError('Contraseña incorrecta o error de conexión.');
      } else {
        setError('Error inesperado al iniciar sesión.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <div className="login-box">
        <h1>DevBoard</h1>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          {error ? <p className="error-msg">{error}</p> : null}
          <button type="submit" className="btn" disabled={loading}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </main>
  );
}
