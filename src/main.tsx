// AI agents: this is the React entry point. It only mounts <App /> — it should
// never grow database logic of its own. Keep talking to the "backend" exclusively
// through `api` / `ensureDbReady` from './client' (imported inside App.tsx or
// your own hooks/components), never by importing PGlite or Drizzle directly.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import App from './App';

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
