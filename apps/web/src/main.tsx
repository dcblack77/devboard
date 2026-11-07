import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { IS_STATIC, installStaticApi } from './lib/staticMode';
import './styles.css';

if (IS_STATIC) installStaticApi();
// Literal env check so Vite strips the theme from normal builds entirely.
if (import.meta.env.VITE_STATIC === '1' && import.meta.env.VITE_THEME === 'brand') void import('./themes/brand.css');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
