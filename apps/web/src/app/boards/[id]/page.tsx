import BoardEditor from "@/components/boards/BoardEditor";

export default async function BoardPage({ params }: PageProps<"/boards/[id]">) {
  const { id } = await params;
  return <BoardEditor key={id} id={id} />;
}
