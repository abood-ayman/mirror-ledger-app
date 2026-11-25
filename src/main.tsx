import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Two-Tier Google Maps Quota Defense (runtime gm_authFailure + console quota tap)
if (typeof window !== 'undefined') {
  (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
    window.dispatchEvent(
      new CustomEvent('gmp-quota-exceeded', { detail: { reason: 'gm_authFailure' } })
    );
  };

  const origError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const joined = args.map((a) => String(a)).join(' ');
    if (
      /OverQuotaMapError|Quota exceeded|RESOURCE_EXHAUSTED|RefererNotAllowedMapError|ApiTargetBlockedMapError/i.test(
        joined
      )
    ) {
      window.dispatchEvent(
        new CustomEvent('gmp-quota-exceeded', { detail: { reason: joined.slice(0, 160) } })
      );
    }
    origError(...args);
  };
}

createRoot(document.getElementById('root')!).render(<App />);
