"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty">
      <h2>The workspace could not load</h2>
      <p>Check that PostgreSQL is running and try again.</p>
      <button className="button primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
