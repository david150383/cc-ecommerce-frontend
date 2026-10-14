import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { notificationsApi, type Preferences } from "../../api/notifications";
import { Alert, Button, ErrorAlert, Field, PageTitle, Spinner } from "../../components/ui";

const Schema = z
  .object({
    emailOrderUpdates: z.boolean(),
    emailMarketing: z.boolean(),
    smsOrderUpdates: z.boolean(),
    phone: z.string().trim().regex(/^(\+[1-9]\d{7,14})?$/, "International format, e.g. +919800000001"),
  })
  .refine((v) => !v.smsOrderUpdates || v.phone !== "", { message: "Add a phone number to get SMS updates", path: ["phone"] });
type Form = z.infer<typeof Schema>;

const TEMPLATE_LABELS: Record<string, string> = {
  "account.welcome": "Welcome",
  "auth.verify-email": "Email verification",
  "auth.password-reset": "Password reset",
  "order.confirmed": "Order confirmed",
  "order.cancelled": "Order cancelled",
  "order.shipped": "Order shipped",
  "order.delivered": "Order delivered",
  "payment.refunded": "Refund",
};

export function NotificationsPage() {
  const prefs = useQuery({ queryKey: ["preferences"], queryFn: notificationsApi.preferences });
  const history = useQuery({ queryKey: ["notification-history"], queryFn: () => notificationsApi.history() });
  return (
    <section aria-labelledby="page-title" className="max-w-2xl space-y-8">
      <PageTitle>Notifications</PageTitle>
      {prefs.isPending && <Spinner />}
      <ErrorAlert error={prefs.error} />
      {prefs.data && <PreferencesForm initial={prefs.data.preferences} />}
      <section aria-labelledby="history-title" className="space-y-2">
        <h2 id="history-title" className="text-lg font-semibold">Recent messages</h2>
        <ErrorAlert error={history.error} />
        {history.data?.data.length === 0 && <p className="text-sm text-slate-600">Nothing yet.</p>}
        <ul className="divide-y divide-slate-100 text-sm">
          {history.data?.data.map((n) => (
            <li key={n.id} className="flex justify-between py-2">
              <span>{TEMPLATE_LABELS[n.templateKey] ?? n.templateKey} <span className="text-slate-500">({n.channel === "sms" ? "SMS" : "email"})</span></span>
              <span className="text-slate-600">{n.status === "SENT" ? "Sent" : n.status === "SKIPPED" ? "Not sent (your settings)" : n.status === "FAILED" ? "Could not be delivered" : "Sending"}</span>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}

function PreferencesForm({ initial }: { initial: Preferences }) {
  const queryClient = useQueryClient();
  const form = useForm<Form>({
    resolver: zodResolver(Schema),
    defaultValues: { emailOrderUpdates: initial.email.orderUpdates, emailMarketing: initial.email.marketing, smsOrderUpdates: initial.sms.orderUpdates, phone: initial.sms.phone ?? "" },
  });
  const save = useMutation({
    mutationFn: (v: Form) =>
      notificationsApi.savePreferences({ email: { orderUpdates: v.emailOrderUpdates, marketing: v.emailMarketing }, sms: { orderUpdates: v.smsOrderUpdates, phone: v.phone || null } }),
    onSuccess: (r) => queryClient.setQueryData(["preferences"], r),
  });
  const check = (name: "emailOrderUpdates" | "emailMarketing" | "smsOrderUpdates", label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" className="h-4 w-4" {...form.register(name, { onChange: () => save.reset() })} />
      {label}
    </label>
  );
  return (
    <form noValidate onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="mb-1 font-semibold">Email</legend>
        {check("emailOrderUpdates", "Order updates (confirmation, shipping, refunds)")}
        {check("emailMarketing", "Offers and news")}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="mb-1 font-semibold">SMS</legend>
        {check("smsOrderUpdates", "Order updates by SMS")}
        <Field label="Mobile number" type="tel" autoComplete="tel" placeholder="+919800000001" error={form.formState.errors.phone?.message} {...form.register("phone")} />
      </fieldset>
      <p className="text-sm text-slate-600">Security messages (email verification, password reset) are always sent.</p>
      {save.isSuccess && <Alert kind="success">Saved.</Alert>}
      <ErrorAlert error={save.error} />
      <Button type="submit" disabled={save.isPending}>Save preferences</Button>
    </form>
  );
}
