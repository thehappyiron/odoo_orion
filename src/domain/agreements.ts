import { one, type Db, pool } from "@/lib/db";
import type { Line, Subscription } from "@/lib/types";
export async function agreementLines(
  s: Subscription,
  on: string,
  db: Db = pool,
): Promise<Line[]> {
  const amendment = await one<{ after_lines: Line[] }>(
    "SELECT after_lines FROM subscription_amendments WHERE subscription_id=$1 AND effective_on<=$2 ORDER BY effective_on DESC,created_at DESC,id DESC LIMIT 1",
    [s.id, on],
    db,
  );
  return amendment?.after_lines ?? s.accepted ?? s.lines;
}
