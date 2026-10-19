import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { lisbonDateTime } from "@/lib/time";
import { teamAction } from "../../actions";
import { ActionForm, Submit } from "../../ui";

export const dynamic = "force-dynamic";

const ROLE_INFO = {
  admin: "Everything: orders, finance, settings, prices, leads, ads and the team.",
  fulfilment: "Orders (view, mark preparing / shipped / delivered, tracking), gift cards and the shipping CSV. No finance, settings, refunds or lead exports.",
  pt_caller: "Only the Portugal HR leads assigned to them (screen in European Portuguese) and the browser phone. No orders, customers or settings: refused by the server everywhere else.",
};

export default async function Team() {
  const me = await requireAdmin({ role: "admin" });
  const users = await db.select().from(schema.adminUsers).orderBy(asc(schema.adminUsers.createdAt));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Team</h1>
        <p className="text-sm text-muted">Give access to the people who help run the shop. Every action on an order is recorded with their email.</p>
      </div>

      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">Add a team member</h2>
        <ActionForm action={teamAction} className="mt-3 grid gap-3 text-sm sm:grid-cols-[1fr_200px_auto] sm:items-end">
          <input type="hidden" name="action" value="add" />
          <label>Email<input name="email" type="email" required className="mt-1 block w-full rounded-lg border p-2" placeholder="name@example.com" /></label>
          <label>Role
            <select name="role" defaultValue="fulfilment" className="mt-1 block w-full rounded-lg border p-2">
              <option value="fulfilment">Fulfilment</option>
              <option value="pt_caller">Sales rep (Portugal callers)</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <Submit>Create account</Submit>
          <label className="flex items-center gap-2 sm:col-span-3">
            <input type="checkbox" name="send_email" defaultChecked /> Email the login details (temporary password) to the new member
          </label>
        </ActionForm>
        <dl className="mt-4 grid gap-2 text-xs text-muted sm:grid-cols-2">
          <div><dt className="font-semibold text-ink">Admin</dt><dd>{ROLE_INFO.admin}</dd></div>
          <div><dt className="font-semibold text-ink">Fulfilment</dt><dd>{ROLE_INFO.fulfilment}</dd></div>
          <div><dt className="font-semibold text-ink">Sales rep (Portugal callers)</dt><dd>{ROLE_INFO.pt_caller}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-muted">A temporary password is shown once after creating the account. Send it to the person privately; they choose their own password at first login.</p>
      </section>

      <section className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b bg-paper/60 text-left text-xs uppercase tracking-wider text-muted">
            <tr><th className="p-3">Member</th><th>Role</th><th>Status</th><th>Last login</th><th className="pr-3 text-right">Actions</th></tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const self = u.id === me.id;
              return (
                <tr key={u.id} className="border-t align-middle">
                  <td className="p-3">
                    <p className="font-medium">{u.email}{self && <span className="ml-2 rounded bg-paper px-1.5 py-0.5 text-[11px] text-muted">you</span>}</p>
                    <p className="text-xs text-muted">added {lisbonDateTime(u.createdAt)}{u.createdBy ? ` by ${u.createdBy}` : ""}</p>
                  </td>
                  <td>
                    {self ? (
                      <span className="capitalize">{u.role}</span>
                    ) : (
                      <ActionForm action={teamAction} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="action" value="role" />
                        <select name="role" defaultValue={u.role} className="rounded border p-1 text-sm">
                          <option value="fulfilment">Fulfilment</option>
                          <option value="pt_caller">Sales rep (Portugal callers)</option>
                          <option value="admin">Admin</option>
                        </select>
                        <button className="text-xs font-semibold text-azulejo underline">Save</button>
                      </ActionForm>
                    )}
                  </td>
                  <td>
                    {u.disabledAt ? (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">Disabled</span>
                    ) : u.mustChangePassword ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">Invited</span>
                    ) : (
                      <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-800">Active</span>
                    )}
                  </td>
                  <td className="text-xs text-muted">{u.lastLoginAt ? lisbonDateTime(u.lastLoginAt) : "never"}</td>
                  <td className="pr-3">
                    {!self && (
                      <div className="flex flex-wrap justify-end gap-2">
                        <ActionForm action={teamAction} confirm={`Create a new temporary password for ${u.email}? They will be logged out.`}>
                          <input type="hidden" name="id" value={u.id} />
                          <button name="action" value="reset" className="rounded border px-2 py-1 text-xs font-medium hover:bg-paper">Reset password</button>
                        </ActionForm>
                        <ActionForm action={teamAction} confirm={u.disabledAt ? `Enable ${u.email}?` : `Disable ${u.email}? They are logged out immediately.`}>
                          <input type="hidden" name="id" value={u.id} />
                          <button name="action" value={u.disabledAt ? "enable" : "disable"} className="rounded border px-2 py-1 text-xs font-medium hover:bg-paper">{u.disabledAt ? "Enable" : "Disable"}</button>
                        </ActionForm>
                        <ActionForm action={teamAction} confirm={`Delete ${u.email}? Their past actions stay in the order history.`}>
                          <input type="hidden" name="id" value={u.id} />
                          <button name="action" value="delete" className="rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50">Delete</button>
                        </ActionForm>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
