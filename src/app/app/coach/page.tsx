import { MessageSquare } from "lucide-react";
import { ButtonLink, PageHeader } from "~/components/ui-kit/app-shell-kit";
import { EmptyState } from "~/components/home/empty-state";

export default function CoachStub() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Coach"
        title="Coach"
        description="Notes and answers about your block, in one place."
      />
      <div className="animate-rise [animation-delay:60ms]">
        <EmptyState
          icon={MessageSquare}
          title="Coming soon"
          action={
            <ButtonLink href="/app/block" variant="secondary">
              Open your block
            </ButtonLink>
          }
        >
          A full coach history is on its way. For now, ask your coach from a week in your block.
        </EmptyState>
      </div>
    </div>
  );
}
