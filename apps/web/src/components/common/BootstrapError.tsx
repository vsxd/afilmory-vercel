export const BootstrapError = ({ error }: { error: unknown }) => {
  const message = error instanceof Error ? error.message : 'Unknown startup error'

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-6 text-white">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/5 p-8 backdrop-blur">
        <p className="text-sm tracking-[0.2em] text-white/50 uppercase">Manifest Load Failed</p>
        <h1 className="mt-3 text-3xl font-semibold">The photo library could not be initialized.</h1>
        <p className="mt-4 text-sm leading-6 text-white/70">{message}</p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => (window.location.href = '/')}
            className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
          >
            Go Home
          </button>
        </div>
      </div>
    </div>
  )
}
