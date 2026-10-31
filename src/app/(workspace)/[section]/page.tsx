import { notFound } from "next/navigation";
import { WorkspacePage } from "@/components/workspace-page";
const sections = [
  "subscriptions",
  "invoices",
  "payments",
  "customers",
  "products",
  "plans",
  "integrity",
  "simulator",
  "settings",
  "profile",
];
export default async function Section({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!sections.includes(section)) notFound();
  return <WorkspacePage section={section} />;
}
