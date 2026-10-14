import type { RouteObject } from "react-router";
import { RequireAuth } from "./auth/guards";
import { Layout } from "./components/Layout";
import { AccountPage } from "./pages/account/AccountPage";
import { NotificationsPage } from "./pages/account/NotificationsPage";
import { OrderDetailPage, OrdersPage } from "./pages/account/OrdersPages";
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage, VerifyEmailPage } from "./pages/auth/AuthPages";
import { CartPage } from "./pages/CartPage";
import { CatalogPage } from "./pages/CatalogPage";
import { CheckoutPage } from "./pages/CheckoutPage";
import { CheckoutResultPage } from "./pages/CheckoutResultPage";
import { HomePage } from "./pages/HomePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ProductPage } from "./pages/ProductPage";
import { StatusPage } from "./pages/StatusPage";

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "products", element: <CatalogPage /> },
      { path: "products/:slug", element: <ProductPage /> },
      { path: "cart", element: <CartPage /> },
      { path: "login", element: <LoginPage /> },
      { path: "register", element: <RegisterPage /> },
      { path: "forgot-password", element: <ForgotPasswordPage /> },
      { path: "reset-password", element: <ResetPasswordPage /> },
      { path: "verify-email", element: <VerifyEmailPage /> },
      { path: "checkout", element: <RequireAuth><CheckoutPage /></RequireAuth> },
      { path: "checkout/result", element: <RequireAuth><CheckoutResultPage /></RequireAuth> },
      { path: "account", element: <RequireAuth><AccountPage /></RequireAuth> },
      { path: "account/orders", element: <RequireAuth><OrdersPage /></RequireAuth> },
      { path: "account/orders/:orderId", element: <RequireAuth><OrderDetailPage /></RequireAuth> },
      { path: "account/notifications", element: <RequireAuth><NotificationsPage /></RequireAuth> },
      { path: "status", element: <StatusPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];
