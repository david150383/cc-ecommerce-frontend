import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { isAdmin, useSession } from "../auth/session";
import { cartCount, useCart } from "../cart/cart";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium ${isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`;

export function Layout() {
  const { status, user } = useSession();
  const count = useCart((s) => cartCount(s.lines));
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4">
        Skip to content
      </a>
      <header className="border-b border-slate-200">
        <nav aria-label="Main" className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3">
          <Link to="/" className="mr-4 text-lg font-semibold tracking-tight">
            Shop
          </Link>
          <NavLink to="/products" className={navLinkClass}>
            Products
          </NavLink>
          <form
            role="search"
            className="mr-auto"
            onSubmit={(e) => {
              e.preventDefault();
              const q = String(new FormData(e.currentTarget).get("q") ?? "").trim();
              navigate(q ? `/products?q=${encodeURIComponent(q)}` : "/products");
            }}
          >
            <label>
              <span className="sr-only">Search products</span>
              <input name="q" type="search" placeholder="Search" className="w-40 rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
            </label>
          </form>
          {isAdmin(user) && (
            <NavLink to="/admin" className={navLinkClass}>
              Admin
            </NavLink>
          )}
          {status === "authenticated" ? (
            <NavLink to="/account" className={navLinkClass}>
              Account
            </NavLink>
          ) : (
            status === "anonymous" && (
              <NavLink to="/login" className={navLinkClass}>
                Sign in
              </NavLink>
            )
          )}
          <NavLink to="/cart" className={navLinkClass}>
            Cart{count > 0 && <span className="ml-1 rounded-full bg-slate-200 px-1.5 text-xs text-slate-900" aria-label={`${count} items`}>{count}</span>}
          </NavLink>
        </nav>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 py-6 text-center text-sm text-slate-500">
        E-commerce microservices platform (learning project) · <Link to="/status" className="underline">System status</Link>
      </footer>
    </div>
  );
}
