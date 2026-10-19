import { requireAdmin } from "@/lib/auth";
import { passwordAction } from "../actions";
import { ActionForm, Submit } from "../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Change password · Admin", robots: { index: false } };

export default async function PasswordPage() {
  const me = await requireAdmin({ allowPasswordChange: true, allowPtCaller: true });
  return (
    <main className="grid min-h-screen place-items-center bg-[#f1f1f1] p-4">
      <ActionForm action={passwordAction} className="w-full max-w-sm rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">{me.mustChangePassword ? "Choose your password" : "Change password"}</h1>
        <p className="mt-1 text-sm text-muted">{me.email}</p>
        {me.mustChangePassword && <p className="mt-3 rounded bg-amber-50 p-2 text-xs text-amber-900">You signed in with a temporary password. Choose your own to continue.</p>}
        <label className="mt-4 block text-sm font-medium">
          New password (12+ characters)
          <input name="password" type="password" required minLength={12} autoComplete="new-password" className="mt-1 w-full rounded-lg border p-2" />
        </label>
        <label className="mt-3 block text-sm font-medium">
          Repeat new password
          <input name="password2" type="password" required minLength={12} autoComplete="new-password" className="mt-1 w-full rounded-lg border p-2" />
        </label>
        <Submit className="mt-5 w-full">Save password</Submit>
        {!me.mustChangePassword && <a href="/admin" className="mt-3 block text-center text-sm text-muted underline">Cancel</a>}
      </ActionForm>
    </main>
  );
}
