const dotStyle = {
  width: '0.375rem',
  height: '0.375rem',
  background: 'rgba(255, 255, 255, 0.6)',
  borderRadius: '50%',
} as const

function getBootstrapSplashText() {
  const siteConfig =
    typeof window !== 'undefined'
      ? window.__SITE_CONFIG__
      : (globalThis as typeof globalThis & { __SITE_CONFIG__?: Window['__SITE_CONFIG__'] }).__SITE_CONFIG__

  return {
    title: siteConfig?.title ?? 'Afilmory',
    description: siteConfig?.description ?? 'Loading photos',
  }
}

export const BootstrapSplash = () => {
  const { title, description } = getBootstrapSplashText()

  return (
    <div
      id="splash-screen"
      data-testid="bootstrap-splash"
      role="status"
      aria-live="polite"
      aria-label="Loading"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        background: '#0a0a0a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        fontFamily: "'Geist', ui-sans-serif, system-ui, sans-serif",
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '2rem',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '3.5rem',
            height: '3.5rem',
            background: 'rgba(255, 255, 255, 0.85)',
            borderRadius: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.1), 0 4px 16px rgba(0, 0, 0, 0.4)',
            animation: 'logoFade 1.2s cubic-bezier(0.16, 1, 0.3, 1) both',
            backdropFilter: 'blur(10px)',
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#0a0a0a"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 9a2 2 0 0 1 2-2h.93a2 2 0 0 0 1.664-.89l.812-1.22A2 2 0 0 1 10.07 4h3.86a2 2 0 0 1 1.664.89l.812 1.22A2 2 0 0 0 18.07 7H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z" />
            <circle cx="12" cy="13" r="3" />
          </svg>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <h1
            style={{
              fontSize: '1.75rem',
              fontWeight: 600,
              letterSpacing: 0,
              color: 'rgba(255, 255, 255, 0.85)',
              margin: 0,
              animation: 'titleFade 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both',
            }}
          >
            {title}
          </h1>
          <p
            style={{
              color: 'rgba(255, 255, 255, 0.5)',
              fontSize: '0.875rem',
              margin: 0,
              fontWeight: 400,
              letterSpacing: 0,
              animation: 'subtitleFade 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.4s both',
            }}
          >
            {description}
          </p>
        </div>

        <div style={{ marginTop: '1rem', animation: 'loaderFade 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.6s both' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <div style={{ ...dotStyle, animation: 'dotPulse 1.4s ease-in-out infinite' }} />
            <div style={{ ...dotStyle, animation: 'dotPulse 1.4s ease-in-out infinite 0.2s' }} />
            <div style={{ ...dotStyle, animation: 'dotPulse 1.4s ease-in-out infinite 0.4s' }} />
          </div>
        </div>
      </div>
      <style>{`
        @keyframes logoFade {
          0% {
            opacity: 0;
            transform: translateY(-10px) scale(0.9);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes titleFade {
          0% {
            opacity: 0;
            transform: translateY(10px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes subtitleFade {
          0% {
            opacity: 0;
            transform: translateY(8px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes loaderFade {
          0% {
            opacity: 0;
            transform: translateY(6px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes dotPulse {
          0%,
          100% {
            opacity: 0.3;
            transform: scale(0.8);
          }
          50% {
            opacity: 1;
            transform: scale(1);
          }
        }

        @media (max-width: 640px) {
          #splash-screen h1 {
            font-size: 1.5rem;
          }
          #splash-screen p {
            font-size: 0.8rem;
          }
        }
      `}</style>
    </div>
  )
}
