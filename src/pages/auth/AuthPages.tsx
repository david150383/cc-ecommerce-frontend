import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router";
import { z } from "zod";
import { authApi } from "../../api/auth";
import { ApiError } from "../../api/http";
import { safeNext } from "../../auth/redirect";
import { useSession } from "../../auth/session";
import { Alert, Button, ErrorAlert, Field, PageTitle, Spinner } from "../../components/ui";

// Mirrors the Auth Service's rules so users get instant feedback; the service still decides.
const password = z.string().min(12, "At least 12 characters").max(128, "At most 128 characters");
const email = z.email("Enter a valid email address").max(320);

function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby="page-title" className="mx-auto max-w-md space-y-6">
      <PageTitle>{title}</PageTitle>
      {children}
    </section>
  );
}

/**
 * Secret tokens arrive in the link's query string. Read once, then remove them from the address bar
 * and history, so they do not linger in the URL, bookmarks or screenshots.
 */
function useOneTimeToken(): string | null {
  const [params] = useSearchParams();
  const [token] = useState(() => params.get("token"));
  useEffect(() => {
    if (params.has("token")) window.history.replaceState(null, "", window.location.pathname);
  }, [params]);
  return token;
}

// ------------------------------------------------------------------------------------------- login
const LoginSchema = z.object({ email, password: z.string().min(1, "Enter your password") });

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const setSession = useSession((s) => s.setSession);
  const form = useForm({ resolver: zodResolver(LoginSchema) });
  const login = useMutation({
    mutationFn: (v: z.infer<typeof LoginSchema>) => authApi.login(v.email, v.password),
    onSuccess: (r) => {
      setSession(r);
      navigate(safeNext(params.get("next")), { replace: true });
    },
  });
  // One message for every credential failure: never reveal whether the account exists.
  const failed = login.error instanceof ApiError && login.error.status === 401;
  return (
    <AuthCard title="Sign in">
      {failed ? <Alert>Email or password is incorrect.</Alert> : <ErrorAlert error={login.error} />}
      <form noValidate onSubmit={form.handleSubmit((v) => login.mutate(v))} className="space-y-4">
        <Field label="Email" type="email" autoComplete="email" error={form.formState.errors.email?.message} {...form.register("email")} />
        <Field label="Password" type="password" autoComplete="current-password" error={form.formState.errors.password?.message} {...form.register("password")} />
        <Button type="submit" disabled={login.isPending} className="w-full">
          {login.isPending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="flex justify-between text-sm">
        <Link to="/forgot-password" className="underline">
          Forgot your password?
        </Link>
        <Link to="/register" className="underline">
          Create an account
        </Link>
      </p>
    </AuthCard>
  );
}

// ---------------------------------------------------------------------------------------- register
const RegisterSchema = z
  .object({ fullName: z.string().trim().min(1, "Enter your name").max(200), email, password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "The passwords do not match", path: ["confirm"] });

export function RegisterPage() {
  const navigate = useNavigate();
  const setSession = useSession((s) => s.setSession);
  const form = useForm({ resolver: zodResolver(RegisterSchema) });
  const register = useMutation({
    mutationFn: async (v: z.infer<typeof RegisterSchema>) => {
      await authApi.register({ email: v.email, password: v.password, fullName: v.fullName });
      return authApi.login(v.email, v.password);
    },
    onSuccess: (r) => {
      setSession(r);
      navigate("/account?welcome=1", { replace: true });
    },
  });
  const fieldErrors = register.error instanceof ApiError ? register.error.fields : [];
  return (
    <AuthCard title="Create an account">
      {register.error instanceof ApiError && register.error.code === "EMAIL_ALREADY_REGISTERED" ? (
        <Alert>
          An account with this email already exists. <Link to="/login" className="underline">Sign in</Link> or reset your password.
        </Alert>
      ) : (
        <ErrorAlert error={register.error} />
      )}
      <form noValidate onSubmit={form.handleSubmit((v) => register.mutate(v))} className="space-y-4">
        <Field label="Full name" autoComplete="name" error={form.formState.errors.fullName?.message} {...form.register("fullName")} />
        <Field label="Email" type="email" autoComplete="email" error={form.formState.errors.email?.message} {...form.register("email")} />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 12 characters. A short sentence works well."
          error={form.formState.errors.password?.message ?? fieldErrors.find((f) => f.path === "password")?.message}
          {...form.register("password")}
        />
        <Field label="Confirm password" type="password" autoComplete="new-password" error={form.formState.errors.confirm?.message} {...form.register("confirm")} />
        <Button type="submit" disabled={register.isPending} className="w-full">
          {register.isPending ? "Creating your account…" : "Create account"}
        </Button>
      </form>
    </AuthCard>
  );
}

// --------------------------------------------------------------------------------- forgot password
export function ForgotPasswordPage() {
  const form = useForm({ resolver: zodResolver(z.object({ email })) });
  const forgot = useMutation({ mutationFn: (v: { email: string }) => authApi.forgotPassword(v.email) });
  return (
    <AuthCard title="Reset your password">
      {forgot.isSuccess ? (
        // The same answer whether or not the account exists (no account enumeration).
        <Alert kind="success">If an account exists for that address, we have sent a link to reset the password. It expires soon.</Alert>
      ) : (
        <>
          <ErrorAlert error={forgot.error} />
          <form noValidate onSubmit={form.handleSubmit((v) => forgot.mutate(v))} className="space-y-4">
            <Field label="Email" type="email" autoComplete="email" error={form.formState.errors.email?.message} {...form.register("email")} />
            <Button type="submit" disabled={forgot.isPending} className="w-full">
              Send reset link
            </Button>
          </form>
        </>
      )}
    </AuthCard>
  );
}

// ---------------------------------------------------------------------------------- reset password
const ResetSchema = z.object({ password, confirm: z.string() }).refine((v) => v.password === v.confirm, { message: "The passwords do not match", path: ["confirm"] });

export function ResetPasswordPage() {
  const token = useOneTimeToken();
  const clear = useSession((s) => s.clear);
  const form = useForm({ resolver: zodResolver(ResetSchema) });
  const reset = useMutation({
    mutationFn: (v: z.infer<typeof ResetSchema>) => authApi.resetPassword(token!, v.password),
    onSuccess: () => clear(), // every session was revoked, this one included
  });
  if (!token) return <AuthCard title="Reset your password"><Alert>This link is incomplete. Request a new one from <Link to="/forgot-password" className="underline">Forgot password</Link>.</Alert></AuthCard>;
  if (reset.isSuccess)
    return (
      <AuthCard title="Password changed">
        <Alert kind="success">Your password was changed and you were signed out everywhere.</Alert>
        <Link to="/login" className="underline">Sign in with your new password</Link>
      </AuthCard>
    );
  const expired = reset.error instanceof ApiError && reset.error.code === "INVALID_OR_EXPIRED_TOKEN";
  return (
    <AuthCard title="Choose a new password">
      {expired ? (
        <Alert>
          This link is invalid or has expired. <Link to="/forgot-password" className="underline">Request a new one</Link>.
        </Alert>
      ) : (
        <ErrorAlert error={reset.error} />
      )}
      <form noValidate onSubmit={form.handleSubmit((v) => reset.mutate(v))} className="space-y-4">
        <Field label="New password" type="password" autoComplete="new-password" hint="At least 12 characters." error={form.formState.errors.password?.message} {...form.register("password")} />
        <Field label="Confirm new password" type="password" autoComplete="new-password" error={form.formState.errors.confirm?.message} {...form.register("confirm")} />
        <Button type="submit" disabled={reset.isPending} className="w-full">
          Change password
        </Button>
      </form>
    </AuthCard>
  );
}

// ------------------------------------------------------------------------------------ verify email
export function VerifyEmailPage() {
  const token = useOneTimeToken();
  const { user, setUser } = useSession();
  const verify = useMutation({ mutationFn: (t: string) => authApi.verifyEmail(t) });
  const started = useRef(false);
  useEffect(() => {
    // Exactly once, even under StrictMode's double effects (the endpoint is idempotent anyway).
    if (token && !started.current) {
      started.current = true;
      verify.mutate(token, { onSuccess: () => user && setUser({ ...user, emailVerified: true }) });
    }
  }, [token, verify, user, setUser]);
  return (
    <AuthCard title="Verify your email">
      {!token && <Alert>This link is incomplete. You can request a new one from your account page.</Alert>}
      {verify.isPending && <Spinner label="Verifying…" />}
      {verify.isSuccess && <Alert kind="success">Your email address is verified. Thank you!</Alert>}
      {verify.isError && <Alert>This link is invalid or has expired. You can request a new one from your account page.</Alert>}
      <Link to="/" className="underline">Continue shopping</Link>
    </AuthCard>
  );
}
