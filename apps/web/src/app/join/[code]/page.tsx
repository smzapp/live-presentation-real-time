import JoinEntry from "@/components/presenter/JoinEntry";

export default async function JoinPage({ params, searchParams }: PageProps<"/join/[code]">) {
  const { code } = await params;
  // The passcode from an invite link: /join/ABC123?key=K7P2M9QX. Read here
  // rather than with useSearchParams so the client never renders without it.
  const { key } = await searchParams;
  return (
    <JoinEntry
      key={code}
      code={code.toUpperCase()}
      linkKey={typeof key === "string" ? key : undefined}
    />
  );
}
