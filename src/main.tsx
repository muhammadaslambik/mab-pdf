import './lib/storage';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { applyTheme, getPref } from './lib/theme';
import './styles.css';

applyTheme(getPref());
registerSW({ immediate: true, onOfflineReady: () => window.dispatchEvent(new CustomEvent('mab:offline-ready')) });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
