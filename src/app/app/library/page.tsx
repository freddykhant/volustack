import { Library } from "lucide-react";
import { PageHeader } from "~/components/ui-kit/app-shell-kit";
import { EmptyState } from "~/components/home/empty-state";

export default function LibraryStub() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Library"
        title="Library"
        description="The exercises and splits your plans are built from."
      />
      <div className="animate-rise [animation-delay:60ms]">
        <EmptyState icon={Library} title="Coming soon">
          The library is on its way. Your block already draws on it behind the scenes.
        </EmptyState>
      </div>
    </div>
  );
}
