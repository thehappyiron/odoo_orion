import { AppError } from "@/lib/errors";
import type { Actor } from "@/lib/types";
import { one, type Db, pool } from "@/lib/db";
export function staff(actor: Actor) {
  if (actor.role === "CUSTOMER")
    throw new AppError(
      403,
      "FORBIDDEN",
      "This action is available to the internal team.",
    );
}
export function admin(actor: Actor) {
  if (actor.role !== "ADMIN")
    throw new AppError(
      403,
      "FORBIDDEN",
      "Only an administrator can perform this action.",
    );
}
export async function customerScope(
  actor: Actor,
  db: Db = pool,
): Promise<string | null> {
  if (actor.role !== "CUSTOMER") return null;
  const profile = await one<{ id: string }>(
    "SELECT id FROM customers WHERE user_id=$1",
    [actor.id],
    db,
  );
  if (!profile)
    throw new AppError(404, "NOT_FOUND", "Customer profile not found.");
  return profile.id;
}
export async function audit(
  db: Db,
  actor: Actor | null,
  action: string,
  entityId: string,
  detail: unknown = {},
) {
  await db.query(
    "INSERT INTO audit(actor_id,action,entity_id,detail) VALUES($1,$2,$3,$4)",
    [actor?.id ?? null, action, entityId, JSON.stringify(detail)],
  );
}
