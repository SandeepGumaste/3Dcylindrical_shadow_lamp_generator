import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import App from './App.tsx';
import { AuthGate } from './auth/AuthGate';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
    <Analytics />
  </StrictMode>,
);
