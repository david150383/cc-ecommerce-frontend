/**
 * Compile-time contract check against the PINNED API contracts (contracts/openapi → src/api/generated).
 *
 * Each line asserts: what the service PUBLISHES (generated from its OpenAPI document) is assignable to
 * the type this UI READS (hand-written in src/api). If a pinned release drops, renames or changes a field
 * the UI relies on, `npm run typecheck` fails here, before anything ships. Fields the API adds are fine.
 */
import type { Payment, Refund, AdminNotification, DeadLetter, Movement, Saga, StockItem } from "./admin";
import type { Availability, Category, Product, ProductSummary } from "./catalog";
import type { NotificationItem, Preferences } from "./notifications";
import type { CheckoutStatus, Order } from "./orders";
import type { User } from "../auth/session";
import type * as Auth from "./generated/auth-service";
import type * as InventoryApi from "./generated/inventory-service";
import type * as Notification from "./generated/notification-service";
import type * as OrderApi from "./generated/order-service";
import type * as PaymentApi from "./generated/payment-service";
import type * as ProductApi from "./generated/product-service";
import type * as SagaApi from "./generated/saga-orchestrator";

type Assignable<Published, UiReads> = [Published] extends [UiReads] ? true : { error: "the API no longer provides what the UI reads"; published: Published; uiReads: UiReads };
const ok = <T extends true>(_: T) => _;

export const contractChecks = [
  ok<Assignable<Auth.SchemaUser, User>>(true),
  ok<Assignable<ProductApi.SchemaProductSummary, ProductSummary>>(true),
  ok<Assignable<ProductApi.SchemaProductDetail, Product>>(true),
  ok<Assignable<ProductApi.SchemaCategoryNode, Category>>(true),
  ok<Assignable<OrderApi.SchemaOrder, Order>>(true),
  ok<Assignable<SagaApi.SchemaCheckoutStatus, CheckoutStatus>>(true),
  ok<Assignable<SagaApi.SchemaAdminSaga, Saga>>(true),
  ok<Assignable<PaymentApi.SchemaPayment, Payment>>(true),
  ok<Assignable<PaymentApi.SchemaRefund, Refund>>(true),
  ok<Assignable<Notification.SchemaPreferences, Preferences>>(true),
  ok<Assignable<Notification.SchemaNotification, NotificationItem>>(true),
  ok<Assignable<Notification.SchemaAdminNotification, AdminNotification>>(true),
  ok<Assignable<Notification.SchemaDeadLetter, DeadLetter>>(true),
  ok<Assignable<InventoryApi.SchemaAvailabilityDto, Availability>>(true),
  ok<Assignable<InventoryApi.SchemaStockDto, StockItem>>(true),
  ok<Assignable<InventoryApi.SchemaMovementDto, Movement>>(true),
] as const;
