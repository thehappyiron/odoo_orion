"use client";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  Infinity,
  ArrowRight,
  Eye,
  EyeSlash,
  ShieldCheck,
  CheckCircle,
  ArrowLeft,
  Stack,
  ArrowsClockwise,
} from "@phosphor-icons/react";
import { api, Spinner } from "./ui";
type Mode = "login" | "signup" | "forgot" | "reset";
const content = {
  login: {
    eyebrow: "WELCOME BACK",
    title: "A clearer day starts here.",
    description: "Sign in to your Brightloop workspace.",
    button: "Sign in",
  },
  signup: {
    eyebrow: "START YOUR ACCOUNT",
    title: "Hello, brighter billing.",
    description: "Create your customer account to manage subscriptions.",
    button: "Create account",
  },
  forgot: {
    eyebrow: "LET’S GET YOU BACK IN",
    title: "Forgot your password?",
    description:
      "Enter your registered email. A one-time reset link will be placed in the local outbox.",
    button: "Request reset link",
  },
  reset: {
    eyebrow: "A FRESH START",
    title: "Set a new password.",
    description: "Choose a strong password for your Brightloop account.",
    button: "Update password",
  },
};
export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const c = content[mode];
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (["signup", "reset"].includes(mode) && password !== confirm)
        throw new Error("The passwords do not match.");
      const endpoint = {
        login: "sign-in/email",
        signup: "sign-up/email",
        forgot: "request-password-reset",
        reset: "reset-password",
      }[mode];
      const body =
        mode === "login"
          ? { email, password }
          : mode === "signup"
            ? { email, password, name }
            : mode === "forgot"
              ? { email, redirectTo: "/reset-password" }
              : { newPassword: password, token: params.get("token") };
      const response = await fetch(`/api/auth/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          mode === "login"
            ? "The email or password is incorrect."
            : (result.message ?? "This request could not be completed."),
        );
      if (mode === "signup")
        await api("profile", { company, contact: name, address: "" });
      if (mode === "login" || mode === "signup") {
        router.replace("/");
        router.refresh();
      } else setSuccess(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const needsPassword = mode !== "forgot";
  const tokenMissing =
    mode === "reset" && (!params.get("token") || Boolean(params.get("error")));
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Link href="/login" className="brand auth-brand">
          <span className="brand-mark">
            <Infinity weight="bold" size={31} />
          </span>
          <span>
            brightloop<span className="brand-period">.</span>
          </span>
        </Link>
        <div className="auth-story-copy">
          <span className="auth-pill">
            <span className="live-dot" />
            SUBSCRIPTION WORKSPACE
          </span>
          <h1>
            Good business.
            <br />
            Clearer cycles<span>.</span>
          </h1>
          <p>
            One place for the plans you sell,
            <br />
            the people you serve, and every bill in between.
          </p>
          <div className="auth-orbit-card">
            <div className="auth-orbit-line">
              <span>
                <Stack size={22} />
              </span>
              <div>
                <strong>Start with a clear agreement</strong>
                <small>Products, plans and quotations</small>
              </div>
              <CheckCircle size={19} />
            </div>
            <div className="auth-connector" />
            <div className="auth-orbit-line">
              <span>
                <ArrowsClockwise size={22} />
              </span>
              <div>
                <strong>Keep every cycle on track</strong>
                <small>Accurate, repeatable billing</small>
              </div>
              <CheckCircle size={19} />
            </div>
            <div className="auth-connector" />
            <div className="auth-orbit-line">
              <span>
                <ShieldCheck size={22} />
              </span>
              <div>
                <strong>Know exactly where you stand</strong>
                <small>Every amount, accounted for</small>
              </div>
              <CheckCircle size={19} />
            </div>
          </div>
        </div>
        <p className="auth-story-footer">
          Built for Brightloop Software. Made for clarity.
        </p>
      </section>
      <section className="auth-main">
        <div className="auth-top-note">
          <span>Simple. Connected. In control.</span>
          <span className="auth-top-dot" />
        </div>
        <div className="auth-form-container">
          <p className="eyebrow">{c.eyebrow}</p>
          <h2>{c.title}</h2>
          <p className="auth-description">{c.description}</p>
          {success ? (
            <div className="auth-success" role="status">
              <CheckCircle size={36} />
              <h3>
                {mode === "forgot"
                  ? "Check the local outbox."
                  : "Your password is updated."}
              </h3>
              <p>
                {mode === "forgot"
                  ? "If this email is registered, its reset link is available to the administrator in Settings → Local outbox. For local development, use npm run outbox -- your@email.com."
                  : "You can now sign in with your new password."}
              </p>
              <Link href="/login" className="button primary">
                Back to sign in
                <ArrowRight size={18} />
              </Link>
            </div>
          ) : tokenMissing ? (
            <div className="form-error" role="alert">
              This reset link is missing, invalid or expired.{" "}
              <Link href="/forgot-password">Request another link</Link>.
            </div>
          ) : (
            <form onSubmit={submit}>
              {mode === "signup" ? (
                <>
                  <label className="field">
                    Full name
                    <input
                      autoComplete="name"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    Company name
                    <input
                      autoComplete="organization"
                      required
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                    />
                  </label>
                </>
              ) : null}
              {mode !== "reset" ? (
                <label className="field">
                  Email address
                  <input
                    type="email"
                    placeholder="you@company.com"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
              ) : null}
              {needsPassword ? (
                <>
                  <label className="field">
                    <span>
                      {mode === "reset" ? "New password" : "Password"}
                    </span>
                    <span className="password-wrap">
                      <input
                        type={show ? "text" : "password"}
                        autoComplete={
                          mode === "login" ? "current-password" : "new-password"
                        }
                        required
                        minLength={mode === "login" ? undefined : 9}
                        maxLength={128}
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={show ? "Hide password" : "Show password"}
                        onClick={() => setShow(!show)}
                      >
                        {show ? <EyeSlash size={19} /> : <Eye size={19} />}
                      </button>
                    </span>
                  </label>
                  {mode !== "login" ? (
                    <>
                      <label className="field">
                        Confirm password
                        <input
                          type={show ? "text" : "password"}
                          autoComplete="new-password"
                          required
                          minLength={9}
                          value={confirm}
                          onChange={(e) => setConfirm(e.target.value)}
                        />
                      </label>
                      <p className="password-hint">
                        9+ characters, uppercase, lowercase and a special
                        character.
                      </p>
                    </>
                  ) : (
                    <div className="login-options">
                      <span>
                        <ShieldCheck size={15} />
                        Secure local session
                      </span>
                      <Link href="/forgot-password">Forgot password?</Link>
                    </div>
                  )}
                </>
              ) : null}
              {error ? (
                <p className="form-error" role="alert">
                  {error}
                </p>
              ) : null}
              <button
                className="button primary auth-submit"
                disabled={busy}
                type="submit"
              >
                {busy ? <Spinner /> : null}
                {c.button}
                <ArrowRight size={18} />
              </button>
            </form>
          )}
          {!success ? (
            <p className="auth-switch">
              {mode === "login" ? (
                <>
                  New to Brightloop?{" "}
                  <Link href="/signup">
                    Create an account
                    <ArrowUpRightInline />
                  </Link>
                </>
              ) : mode === "signup" ? (
                <>
                  Already have an account? <Link href="/login">Sign in</Link>
                </>
              ) : (
                <Link href="/login">
                  <ArrowLeft size={15} />
                  Back to sign in
                </Link>
              )}
            </p>
          ) : null}
          <div className="auth-local-note">
            <ShieldCheck size={18} />
            <span>
              No external services. No ML.
              <br />
              <small>Your workspace runs on local PostgreSQL.</small>
            </span>
          </div>
        </div>
        <footer className="auth-footer">
          Brightloop · Every cycle, accounted for.
        </footer>
      </section>
    </main>
  );
}
function ArrowUpRightInline() {
  return <ArrowRight size={14} style={{ transform: "rotate(-40deg)" }} />;
}
