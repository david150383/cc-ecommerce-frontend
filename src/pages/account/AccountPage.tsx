import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router";
import { authApi } from "../../api/auth";
import { useSession } from "../../auth/session";
import { Alert, Button, ErrorAlert, PageTitle } from "../../components/ui";

export function AccountPage() {
  const { user, clear } = useSession();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const resend = useMutation({ mutationFn: authApi.resendVerification });
  const logout = useMutation({
    mutationFn: (everywhere: boolean) => authApi.logout(everywhere),
    // Signed out locally whatever the server said: the user asked to leave.
    onSettled: () => {
      clear();
      queryClient.clear(); // no cached personal data survives sign-out
      navigate("/", { replace: true });
    },
  });
  if (!user) return null;
  return (
    <section aria-labelledby="page-title" className="max-w-2xl space-y-8">
      <PageTitle>Your account</PageTitle>
      {params.get("welcome") && <Alert kind="success">Welcome, {user.fullName}! We sent you an email to verify your address.</Alert>}
      <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-2 text-sm">
        <dt className="text-slate-500">Name</dt>
        <dd>{user.fullName}</dd>
        <dt className="text-slate-500">Email</dt>
        <dd>
          {user.email}{" "}
          {user.emailVerified ? (
            <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-800">Verified</span>
          ) : (
            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">Not verified</span>
          )}
        </dd>
      </dl>
      {!user.emailVerified && (
        <div className="space-y-2">
          {resend.isSuccess ? <Alert kind="success">We sent a new verification email.</Alert> : <ErrorAlert error={resend.error} />}
          <Button variant="secondary" disabled={resend.isPending || resend.isSuccess} onClick={() => resend.mutate()}>
            Resend verification email
          </Button>
        </div>
      )}
      <nav aria-label="Account" className="flex flex-wrap gap-4 text-sm">
        <Link to="/account/orders" className="underline">Your orders</Link>
        <Link to="/account/notifications" className="underline">Notification preferences</Link>
      </nav>
      <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-6">
        <Button variant="secondary" onClick={() => logout.mutate(false)} disabled={logout.isPending}>
          Sign out
        </Button>
        <Button variant="secondary" onClick={() => logout.mutate(true)} disabled={logout.isPending}>
          Sign out everywhere
        </Button>
      </div>
    </section>
  );
}
