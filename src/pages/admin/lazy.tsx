import { type ComponentType, lazy, Suspense } from "react";
import { Spinner } from "../../components/ui";

type AdminModule = typeof import("./index");

/**
 * Admin pages via React.lazy, rendered INSIDE RequireAdmin: the chunk is requested only once the
 * role check has passed, so customers never download admin code. (Route-level `lazy` would fetch
 * it during route matching, before any guard runs.)
 */
function page(name: keyof AdminModule) {
  const Component = lazy(async () => ({ default: (await import("./index"))[name] as ComponentType }));
  return function AdminPage() {
    return (
      <Suspense fallback={<Spinner />}>
        <Component />
      </Suspense>
    );
  };
}

export const Admin = {
  Layout: page("AdminLayout"),
  Dashboard: page("AdminDashboard"),
  Products: page("AdminProductsPage"),
  NewProduct: page("AdminNewProductPage"),
  Product: page("AdminProductPage"),
  Inventory: page("AdminInventoryPage"),
  Orders: page("AdminOrdersPage"),
  Order: page("AdminOrderPage"),
  Payments: page("AdminPaymentsPage"),
  Checkouts: page("AdminCheckoutsPage"),
  Checkout: page("AdminCheckoutPage"),
  Users: page("AdminUsersPage"),
  Notifications: page("AdminNotificationsPage"),
};
