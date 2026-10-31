import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { auth } from "@/lib/auth";
import { AppError, assert } from "@/lib/errors";
import { one, rows, pool, transaction } from "@/lib/db";
import type { Actor, Invoice } from "@/lib/types";
import { uuid } from "@/lib/validation";
import { admin, staff, audit, customerScope } from "@/domain/access";
import { isCatalog, saveCatalog, saveCustomer } from "@/domain/catalog";
import {
  createSubscription,
  subscription,
  transition,
  subscriptionHistory,
  amendAddons,
} from "@/domain/subscriptions";
import { agreementLines } from "@/domain/agreements";
import {
  invoice,
  invoiceAction,
  invoiceSelect,
  recordPayment,
  reversePayment,
  runBilling,
} from "@/domain/invoices";
import { list, dashboard, parseFilters } from "@/domain/reporting";
import { scan, resolveFinding } from "@/domain/integrity";
import { simulate } from "@/domain/simulation";
import { invoicePdf } from "@/domain/pdf";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const calls = new Map<string, { at: number; count: number }>();
function throttle(id: string) {
  const now = Date.now();
  for (const [k, v] of calls) if (now - v.at > 60000) calls.delete(k);
  const item = calls.get(id) ?? { at: now, count: 0 };
  if (item.count++ >= 10)
    throw new AppError(
      429,
      "RATE_LIMIT",
      "Please wait a minute before another scan or simulation.",
    );
  calls.set(id, item);
}
async function handle(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const requestId = randomUUID();
  try {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session)
      throw new AppError(401, "UNAUTHENTICATED", "Sign in to continue.");
    const actor: Actor = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: session.user.role as Actor["role"],
    };
    const path = (await ctx.params).path;
    const [kind, id, action] = path;
    if (id) uuid.parse(id);
    const url = new URL(req.url);
    const filters = parseFilters(url.searchParams);
    const ok = (data: unknown) =>
      NextResponse.json(
        { data, meta: { requestId } },
        { headers: { "Cache-Control": "no-store" } },
      );
    if (req.method === "GET") {
      if (kind === "me") return ok(actor);
      if (kind === "dashboard") return ok(await dashboard(actor, filters));
      if (kind === "bootstrap") {
        staff(actor);
        const [products, variants, plans, customers, templates, taxes] =
          await Promise.all([
            rows("SELECT * FROM products WHERE active ORDER BY name LIMIT 500"),
            rows("SELECT * FROM variants WHERE active ORDER BY name LIMIT 500"),
            rows("SELECT * FROM plans WHERE active ORDER BY name LIMIT 500"),
            rows(
              "SELECT id,company,email FROM customers ORDER BY company LIMIT 500",
            ),
            rows(
              "SELECT * FROM templates WHERE active ORDER BY name LIMIT 100",
            ),
            rows("SELECT * FROM taxes ORDER BY name LIMIT 100"),
          ]);
        return ok({ products, variants, plans, customers, templates, taxes });
      }
      if (kind === "profile")
        return ok(
          (await one(
            'SELECT c.*,u.name FROM customers c JOIN "user" u ON u.id=c.user_id WHERE c.user_id=$1',
            [actor.id],
          )) ?? actor,
        );
      if (kind === "subscriptions" && id) {
        const s = await subscription(actor, id);
        return ok({
          ...s,
          upcoming_lines: await agreementLines(s, s.next_billing_on),
          history: await subscriptionHistory(actor, id),
        });
      }
      if (kind === "invoices" && id) {
        const i = await invoice(actor, id);
        if (action === "pdf")
          return new Response(new Uint8Array(await invoicePdf(i)), {
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `inline; filename="${i.number}.pdf"`,
              "Cache-Control": "private, no-store",
            },
          });
        const payments = await rows(
          "SELECT id,amount,method,paid_on,note,reversed_at FROM payments WHERE invoice_id=$1 ORDER BY created_at DESC",
          [id],
        );
        const previous = await one<Invoice>(
          `${invoiceSelect} WHERE i.subscription_id=$1 AND i.period_start<$2 AND i.status IN ('CONFIRMED','PAID') ORDER BY i.period_start DESC LIMIT 1`,
          [i.subscription_id, i.period_start],
        );
        return ok({
          ...i,
          payments,
          previous: previous
            ? {
                id: previous.id,
                number: previous.number,
                total: previous.total,
                subtotal: previous.subtotal,
                discount: previous.discount,
                tax: previous.tax,
              }
            : null,
        });
      }
      return ok(await list(actor, kind, filters));
    }
    const origin = req.headers.get("origin");
    const trusted = new Set([
      url.origin,
      process.env.APP_BASE_URL,
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ]);
    if (!origin || !trusted.has(origin))
      throw new AppError(
        403,
        "INVALID_ORIGIN",
        "Request origin is not allowed.",
      );
    if (Number(req.headers.get("content-length") ?? 0) > 65536)
      throw new AppError(413, "TOO_LARGE", "Request exceeds 64 KB.");
    const raw = await req.text();
    if (raw.length > 65536)
      throw new AppError(413, "TOO_LARGE", "Request exceeds 64 KB.");
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new AppError(400, "INVALID_JSON", "Expected a JSON request body.");
    }
    if (isCatalog(kind) && !action)
      return ok(await saveCatalog(actor, kind, body, id));
    if (kind === "customers" && !action)
      return ok(await saveCustomer(actor, body, id));
    if (kind === "subscriptions" && id && action === "addons")
      return ok(await amendAddons(actor, id, body));
    if (kind === "subscriptions")
      return ok(
        id
          ? await transition(actor, id, body)
          : await createSubscription(actor, body),
      );
    if (kind === "invoices" && id) {
      const p = z
        .strictObject({
          action: z.enum(["confirm", "cancel", "send", "recalculate"]),
          reason: z.string().max(1000).default(""),
        })
        .parse(body);
      return ok(await invoiceAction(actor, id, p.action, p.reason));
    }
    if (kind === "payments") {
      if (id && action === "reverse") {
        const p = z
          .strictObject({ reason: z.string().min(3).max(1000) })
          .parse(body);
        return ok(await reversePayment(actor, id, p.reason));
      }
      if (!id) return ok(await recordPayment(actor, body));
    }
    if (kind === "billing") {
      admin(actor);
      z.strictObject({}).parse(body);
      return ok(await runBilling(actor));
    }
    if (kind === "scan") {
      staff(actor);
      throttle(actor.id);
      z.strictObject({}).parse(body);
      return ok(await scan(actor));
    }
    if (kind === "findings" && id) {
      const p = z
        .strictObject({ reason: z.string().min(3).max(1000) })
        .parse(body);
      return ok(await resolveFinding(actor, id, p.reason));
    }
    if (kind === "simulate") {
      staff(actor);
      throttle(actor.id);
      const p = z
        .strictObject({
          months: z.number().int().min(1).max(12),
          plan_id: z.uuid().optional(),
        })
        .parse(body);
      return ok(await simulate(actor, p.months, p.plan_id));
    }
    if (kind === "staff") {
      admin(actor);
      const p = z
        .strictObject({
          name: z.string().trim().min(1).max(200),
          email: z.email(),
          password: z.string().max(128),
        })
        .parse(body);
      const result = await auth.api.signUpEmail({ body: p });
      await transaction(async (db) => {
        await db.query("UPDATE \"user\" SET role='STAFF' WHERE id=$1", [
          result.user.id,
        ]);
        await db.query('DELETE FROM session WHERE "userId"=$1', [
          result.user.id,
        ]);
        await db.query("DELETE FROM customers WHERE user_id=$1", [
          result.user.id,
        ]);
        await audit(db, actor, "staff.created", result.user.id);
      });
      return ok({
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        role: "STAFF",
      });
    }
    if (kind === "profile") {
      const p = z
        .strictObject({
          company: z.string().trim().min(1).max(200),
          contact: z.string().trim().min(1).max(200),
          address: z.string().max(2000),
        })
        .parse(body);
      const scope = await customerScope(actor);
      assert(scope, "Profile editing is available to customers.");
      await pool.query(
        "UPDATE customers SET company=$2,contact=$3,address=$4 WHERE id=$1",
        [scope, p.company, p.contact, p.address],
      );
      return ok(p);
    }
    throw new AppError(404, "NOT_FOUND", "Action not found.");
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION",
            message: error.issues
              .map((i) => `${i.path.join(".") || "Request"}: ${i.message}`)
              .join("; "),
            requestId,
          },
        },
        { status: 422 },
      );
    if (error instanceof AppError)
      return NextResponse.json(
        { error: { code: error.code, message: error.message, requestId } },
        { status: error.status },
      );
    const e = error as { code?: string; message?: string; statusCode?: number };
    if (e.code === "23505")
      return NextResponse.json(
        {
          error: {
            code: "DUPLICATE",
            message:
              "A record with this email, code, reference or billing cycle already exists.",
            requestId,
          },
        },
        { status: 409 },
      );
    if (e.code === "23503" || e.code === "23514")
      return NextResponse.json(
        {
          error: {
            code: "CONSTRAINT",
            message:
              "This change violates a reference, limit or billing constraint.",
            requestId,
          },
        },
        { status: 422 },
      );
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500)
      return NextResponse.json(
        {
          error: {
            code: "AUTH_ERROR",
            message: e.message ?? "Account request failed",
            requestId,
          },
        },
        { status: e.statusCode },
      );
    console.error(
      JSON.stringify({
        requestId,
        event: "request.failed",
        message: e.message,
      }),
    );
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL",
          message:
            "The request could not be completed. Check the server log using this request ID.",
          requestId,
        },
      },
      { status: 500 },
    );
  }
}
export const GET = handle;
export const POST = handle;
export const PATCH = handle;
