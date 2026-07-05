export default function ResultLoading() {
  return (
    <div className="flex h-[100dvh] flex-col md:flex-row">
      {/* Left rail skeleton */}
      <aside className="hidden shrink-0 flex-col border-r bg-card/60 md:flex md:w-16 lg:w-60">
        <div className="flex h-14 items-center gap-2 border-b px-3">
          <div className="h-8 w-8 rounded-lg bg-muted" />
          <div className="h-5 w-24 rounded bg-muted" />
        </div>
        <div className="flex flex-1 flex-col gap-1 p-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2.5">
              <div className="h-5 w-5 rounded bg-muted" />
              <div className="hidden h-4 w-16 rounded bg-muted lg:block" />
            </div>
          ))}
        </div>
      </aside>

      {/* Main content skeleton */}
      <div className="flex min-h-0 flex-1 flex-col pb-16 md:pb-0 lg:flex-row">
        <section className="relative min-h-0 min-w-0 flex-1 animate-pulse">
          <div className="grid h-full place-items-center text-sm text-muted-foreground">
            Loading workspace...
          </div>
        </section>

        {/* Right panel skeleton */}
        <aside className="hidden w-[400px] shrink-0 flex-col border-l bg-card lg:flex">
          <div className="border-b px-4 py-3">
            <div className="h-5 w-36 rounded bg-muted" />
            <div className="mt-1 h-3 w-24 rounded bg-muted" />
          </div>
          <div className="flex-1 space-y-4 p-4">
            <div className="h-20 rounded-lg bg-muted/50" />
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-lg border bg-muted/30 p-3">
                  <div className="h-6 w-10 rounded bg-muted" />
                  <div className="mt-1 h-3 w-14 rounded bg-muted" />
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
