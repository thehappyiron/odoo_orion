import type { BetterAuthOptions } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { pool } from "./db";
export function passwordValid(password: string) {
  return (
    password.length >= 9 &&
    password.length <= 128 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[^A-Za-z0-9\s]/.test(password)
  );
}
export const authOptions = {
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: [
    process.env.APP_BASE_URL ?? "http://localhost:3000",
    "http://127.0.0.1:3000",
  ],
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 9,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: 1800,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await pool.query(
        "INSERT INTO outbox(recipient,subject,body,kind,user_id) VALUES($1,$2,$3,'RESET',$4)",
        [
          user.email,
          "Reset your Brightloop password",
          `This one-time local reset link expires in 30 minutes.\n${url}`,
          user.id,
        ],
      );
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "CUSTOMER",
        input: false,
      },
    },
  },
  verification: { storeIdentifier: "hashed" },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 10 },
      "/request-password-reset": { window: 60, max: 5 },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const password = ctx.body?.newPassword ?? ctx.body?.password;
      if (
        ["/sign-up/email", "/reset-password", "/change-password"].includes(
          ctx.path,
        ) &&
        typeof password === "string" &&
        !passwordValid(password)
      ) {
        throw new APIError("BAD_REQUEST", {
          message:
            "Use 9–128 characters, including uppercase, lowercase and a special character.",
        });
      }
      if (typeof ctx.body?.email === "string")
        return {
          context: {
            ...ctx,
            body: { ...ctx.body, email: ctx.body.email.trim().toLowerCase() },
          },
        };
    }),
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const existing = await pool.query(
            "SELECT id FROM customers WHERE email=$1",
            [user.email.toLowerCase()],
          );
          if (existing.rowCount)
            throw new APIError("CONFLICT", {
              message:
                "This email belongs to an existing managed customer. Contact your administrator to set up portal access.",
            });
        },
      },
    },
  },
} satisfies BetterAuthOptions;
