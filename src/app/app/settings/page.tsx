import { PageHeader, Panel } from "~/components/ui-kit/app-shell-kit";
import { SchedulePrefsForm } from "~/components/schedule/schedule-prefs-form";

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Preferences"
        title="Settings"
        description="How your week is laid out. Changes apply to the plans you accept next."
      />
      <div className="animate-rise [animation-delay:60ms]">
        <Panel as="section" aria-label="Schedule" padding="lg">
          <SchedulePrefsForm />
        </Panel>
      </div>
    </div>
  );
}
