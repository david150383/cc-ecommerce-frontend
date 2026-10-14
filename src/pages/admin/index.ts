// The admin area as ONE lazily loaded chunk: customers never download it.
export { AdminDashboard, AdminLayout } from "./AdminLayout";
export {
  AdminCheckoutPage,
  AdminCheckoutsPage,
  AdminInventoryPage,
  AdminNotificationsPage,
  AdminOrderPage,
  AdminOrdersPage,
  AdminPaymentsPage,
  AdminUsersPage,
} from "./AdminOperations";
export { AdminNewProductPage, AdminProductPage, AdminProductsPage } from "./AdminProducts";
