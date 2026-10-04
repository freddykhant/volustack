import { PageHeader, SectionHeading } from "~/components/ui-kit/app-shell-kit";
import { SchedulePrefsForm } from "~/components/schedule/schedule-prefs-form";

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" />
      <SectionHeading title="Schedule" />
      <div className="mt-4 max-w-2xl">
        <SchedulePrefsForm />
      </div>
    </>
  );
}
