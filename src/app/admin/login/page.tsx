import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/auth";
import { loginAction } from "../actions";
import { ActionForm, Submit } from "../ui";

export const dynamic = "force-dynamic";

export default async function Login() {
  if (await getAdmin()) redirect("/admin");
  return (
    <main className="grid min-h-screen place-items-center p-4">
      <ActionForm action={loginAction} className="w-full max-w-sm rounded-lg border bg-white p-6 shadow-sm">
        <h1 className="font-serif text-3xl font-semibold text-night">Admin</h1>
        <p className="text-sm text-muted">Wine Portugal · Trilogia 2160</p>
        <label className="mt-5 block text-sm font-medium">
          Email
          <input name="email" type="email" required autoComplete="username" className="mt-1 w-full rounded border p-2" />
        </label>
        <label className="mt-3 block text-sm font-medium">
          Palavra-passe
          <input name="password" type="password" required autoComplete="current-password" className="mt-1 w-full rounded border p-2" />
        </label>
        <Submit className="mt-5 w-full">Entrar</Submit>
      </ActionForm>
    </main>
  );
}
