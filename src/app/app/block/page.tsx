import { redirect } from "next/navigation";
import { EmptyBlockState } from "~/components/app/empty-block-state";
import { api } from "~/trpc/server";

export default async function BlockIndex() {
  const block = await api.mesocycle.getCurrentBlock();
  if (!block) return <EmptyBlockState />;
  redirect(`/app/block/${block.id}`);
}
