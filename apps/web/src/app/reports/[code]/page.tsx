import SessionReportView from "@/components/reports/SessionReportView";

export default async function SessionReportPage({ params }: PageProps<"/reports/[code]">) {
  const { code } = await params;
  return <SessionReportView key={code} code={code.toUpperCase()} />;
}
