"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "./actions";

export function ActionForm({
  action,
  children,
  className,
  confirm,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  children: React.ReactNode;
  className?: string;
  confirm?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) return e.preventDefault();
        // Several buttons in one form (name="action" value="..."): the clicked button's value did not reach the
        // server action, so copy it into a hidden field before the form data is read.
        const sub = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const form = e.currentTarget;
        form.querySelector("input[data-submitter]")?.remove();
        if (sub?.name) {
          const h = document.createElement("input");
          h.type = "hidden";
          h.name = sub.name;
          h.value = sub.value;
          h.dataset.submitter = "1";
          form.appendChild(h);
        }
      }}
    >
      {children}
      {state?.error && <p className="mt-2 whitespace-pre-line break-words text-sm font-medium text-red-700">{state.error}</p>}
      {state?.ok && <p className="mt-2 whitespace-pre-line break-all text-sm font-medium text-green-700">{state.ok}</p>}
    </form>
  );
}

export function Submit({ children, className = "", name, value }: { children: React.ReactNode; className?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={`inline-flex min-h-10 items-center justify-center rounded bg-[#0F2340] px-4 text-sm font-semibold text-white hover:bg-[#1F4E9C] disabled:opacity-50 ${className}`}
    >
      {pending ? "…" : children}
    </button>
  );
}
