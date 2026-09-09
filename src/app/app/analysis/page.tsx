import { AnalysisView } from "~/components/analysis/analysis-view";
import { EmptyBlockState } from "~/components/app/empty-block-state";
import { api } from "~/trpc/server";

export default async function AnalysisPage() {
  const block = await api.mesocycle.getCurrentBlock();
  if (!block) return <EmptyBlockState />;
  return <AnalysisView block={block} />;
}
