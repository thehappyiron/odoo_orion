import Link from "next/link";
export default function NotFound() {
  return (
    <div className="empty standalone">
      <h1>Page not found</h1>
      <p>This page may have moved or is unavailable.</p>
      <Link className="button primary" href="/">
        Return to workspace
      </Link>
    </div>
  );
}
