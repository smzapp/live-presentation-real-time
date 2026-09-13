import PresenterEntry from "@/components/presenter/PresenterEntry";

export default async function PresentPage({ params }: PageProps<"/present/[code]">) {
  const { code } = await params;
  return <PresenterEntry key={code} code={code.toUpperCase()} />;
}
