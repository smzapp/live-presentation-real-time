import JoinEntry from "@/components/presenter/JoinEntry";

export default async function JoinPage({ params }: PageProps<"/join/[code]">) {
  const { code } = await params;
  return <JoinEntry key={code} code={code.toUpperCase()} />;
}
