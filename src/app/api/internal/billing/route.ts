import { createHash, timingSafeEqual } from "node:crypto";
import { runBilling } from "@/domain/invoices";
export const runtime = "nodejs";
export async function POST(req: Request) {
  const secret = process.env.BILLING_CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer /, "");
  const hash = (s: string) => createHash("sha256").update(s).digest();
  if (!secret || !given || !timingSafeEqual(hash(secret), hash(given)))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ data: await runBilling(null) });
}
