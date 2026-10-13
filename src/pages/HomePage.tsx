export function HomePage() {
  return (
    <section aria-labelledby="home-title" className="space-y-4">
      <h1 id="home-title" className="text-3xl font-bold tracking-tight">
        Welcome
      </h1>
      <p className="max-w-prose text-slate-600">
        The storefront (catalog, cart, checkout, account and admin pages) is built in Phase 5. For now, use the System
        status page to check that every backend service is reachable from the browser.
      </p>
    </section>
  );
}
