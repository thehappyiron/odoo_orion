"use client";
import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  X,
  CircleNotch,
  CheckCircle,
  WarningCircle,
  MagnifyingGlass,
  CaretLeft,
  CaretRight,
} from "@phosphor-icons/react";
import { useEffect, useState, type ReactNode } from "react";
export type Row = Record<string, unknown> & { id: string };
export const money = (n: unknown) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
    minimumFractionDigits: Number(n) % 100 ? 2 : 0,
  }).format(Number(n ?? 0) / 100);
export const prettyDate = (v: unknown) =>
  v
    ? new Date(`${String(v).slice(0, 10)}T12:00:00Z`).toLocaleDateString(
        "en-IN",
        { day: "numeric", month: "short", year: "numeric" },
      )
    : "—";
export const label = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
export async function api<T = Record<string, unknown>>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api/v1/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401)
      throw new Error("Your session has expired. Sign in to continue.");
    throw new Error(result.error?.message ?? "Request failed");
  }
  return result.data;
}
export function useData<T>(path: string, revision = 0) {
  const key = `${path}:${revision}`;
  const [result, setResult] = useState<{
    key: string;
    data?: T;
    error?: string;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    api<T>(path, undefined, controller.signal)
      .then((data) => setResult({ key: `${path}:${revision}`, data }))
      .catch((e) => {
        if (e.name !== "AbortError")
          setResult({ key: `${path}:${revision}`, error: e.message });
      });
    return () => controller.abort();
  }, [path, revision]);
  return {
    data: result?.key === key ? result.data : undefined,
    error: result?.key === key ? result.error : "",
    loading: result?.key !== key,
  };
}
export function Spinner() {
  return <CircleNotch size={19} className="spin" aria-label="Loading" />;
}
export function State({
  error,
  loading,
  empty = false,
}: {
  error?: string;
  loading?: boolean;
  empty?: boolean;
}) {
  if (error)
    return (
      <div className="empty error" role="alert">
        <WarningCircle size={28} />
        <p>{error}</p>
        {error.includes("Sign in") ? (
          <Link href="/login" className="button secondary">
            Sign in
          </Link>
        ) : null}
      </div>
    );
  if (loading)
    return (
      <div className="empty">
        <Spinner />
        <p>Loading your workspace…</p>
      </div>
    );
  if (empty)
    return (
      <div className="empty">
        <CheckCircle size={30} />
        <h3>Nothing here yet</h3>
        <p>Create a record or adjust your filters to get started.</p>
      </div>
    );
  return null;
}
export function Badge({ value }: { value: unknown }) {
  const v = String(value ?? "");
  return (
    <span className={`badge badge-${v.toLowerCase()}`}>
      <span className="status-dot" />
      {label(v)}
    </span>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <Dialog.Root
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className={`modal ${wide ? "modal-wide" : ""}`}>
          <header className="modal-header">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>
                {subtitle ?? "Review the details below."}
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close dialog">
              <X size={21} />
            </Dialog.Close>
          </header>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Toast({
  message,
  error = false,
  onClose,
}: {
  message: string;
  error?: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 6500);
    return () => clearTimeout(timer);
  }, [onClose]);
  return createPortal(
    <div
      role={error ? "alert" : "status"}
      aria-live={error ? "assertive" : "polite"}
      className={`toast ${error ? "toast-error" : ""}`}
    >
      {error ? <WarningCircle size={20} /> : <CheckCircle size={20} />}
      <span>{message}</span>
      <button
        className="icon-button"
        aria-label="Dismiss notification"
        onClick={onClose}
      >
        <X size={16} />
      </button>
    </div>,
    document.body,
  );
}
export function Search({
  value,
  onChange,
  placeholder = "Search records…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search-input">
      <MagnifyingGlass size={18} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
export function Pagination({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (v: number) => void;
}) {
  return (
    <footer className="pagination">
      <span>
        {total
          ? `${(page - 1) * 25 + 1}–${Math.min(page * 25, total)} of ${total} records`
          : "0 records"}
      </span>
      <div>
        <button
          className="icon-button"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <CaretLeft size={17} />
        </button>
        <span>Page {page}</span>
        <button
          className="icon-button"
          aria-label="Next page"
          disabled={page * 25 >= total}
          onClick={() => onPage(page + 1)}
        >
          <CaretRight size={17} />
        </button>
      </div>
    </footer>
  );
}
export function Money({ value }: { value: unknown }) {
  return <span className="money">{money(value)}</span>;
}
export function Info({ children }: { children: ReactNode }) {
  return (
    <p className="info-note">
      <WarningCircle size={17} />
      <span>{children}</span>
    </p>
  );
}
