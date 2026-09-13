import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import './timeline.css';
import './mobile.css';
const standalone = matchMedia('(display-mode: standalone)');
const updateDisplay = () => {
  document.documentElement.dataset.standalone = String(
    standalone.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone,
  );
};
updateDisplay();
standalone.addEventListener('change', updateDisplay);
const updateViewport = () => {
  const viewport = window.visualViewport;
  const height = viewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty('--keyboard-height', `${height}px`);
  document.documentElement.style.setProperty(
    '--keyboard-bottom',
    `${Math.max(0, window.innerHeight - height - (viewport?.offsetTop ?? 0))}px`,
  );
};
updateViewport();
window.visualViewport?.addEventListener('resize', updateViewport);
window.visualViewport?.addEventListener('scroll', updateViewport);
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
