import { notFound } from "next/navigation";
import { BlockHeader } from "~/components/block/block-header";
import { BlockGrid } from "~/components/block/block-grid";
import { mockMesocycle } from "~/views/_fixtures/mock-block";

export default async function BlockPage({ params }: { params: Promise<{ blockId: string }> }) {
  const { blockId } = await params;
  if (blockId !== mockMesocycle.id) notFound();
  return (
    <div className="flex min-h-full flex-col">
      <BlockHeader block={mockMesocycle} />
      <BlockGrid block={mockMesocycle} />
    </div>
  );
}
