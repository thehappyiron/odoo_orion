import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Shell } from "@/components/shell";
import type { Actor } from "@/lib/types";
export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const actor: Actor = {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: session.user.role as Actor["role"],
  };
  return (
    <Shell actor={actor} demo={process.env.ALLOW_LOCAL_DEMO === "true"}>
      {children}
    </Shell>
  );
}
