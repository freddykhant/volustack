import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarPlus,
  Check,
  Dumbbell,
  HeartPulse,
  Info,
  LineChart,
  MoreHorizontal,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  Button,
  ButtonLink,
  Callout,
  Card,
  Chip,
  IconButton,
  PageHeader,
  Panel,
  SectionHeading,
  Skeleton,
  Wordmark,
} from "~/components/ui-kit/app-shell-kit";
import { MotionDemo, SegmentedDemo } from "./_components/interactive-demos";
import { TokenValue, TypeRow } from "./_components/live-value";

export const metadata = { title: "Styleguide · Mesodapt" };

/* ── Token tables (class names are literal so Tailwind sees them) ────────── */

/** `on` = the text token that sits on this fill (on-ink, on-accent), rendered inside the swatch. */
type Swatch = { token: string; cls: string; role: string; on?: { token: string; cls: string } };

const COLOR_GROUPS: { title: string; note: string; swatches: Swatch[] }[] = [
  {
    title: "Ground",
    note: "Shown over the canvas, as they'll sit in the app.",
    swatches: [
      { token: "canvas", cls: "bg-canvas", role: "Page ground" },
      { token: "surface", cls: "bg-surface", role: "Cards, panels" },
      { token: "surface-raised", cls: "bg-surface-raised", role: "Dialogs, menus" },
      { token: "sunken", cls: "bg-sunken", role: "Inputs, wells" },
    ],
  },
  {
    title: "States",
    note: "Washes for interaction and selection.",
    swatches: [
      { token: "hover", cls: "bg-hover", role: "Row hover" },
      { token: "press", cls: "bg-press", role: "Pressed" },
      { token: "selection", cls: "bg-selection", role: "Active row" },
      { token: "callout", cls: "bg-callout", role: "Info banner" },
      { token: "scrim", cls: "bg-scrim", role: "Behind dialogs" },
    ],
  },
  {
    title: "Ink",
    note: "Four text tiers. Subtle never carries anything critical.",
    swatches: [
      { token: "fg", cls: "bg-fg", role: "Titles, body" },
      { token: "fg-soft", cls: "bg-fg-soft", role: "Eyebrows" },
      { token: "fg-muted", cls: "bg-fg-muted", role: "Descriptions" },
      { token: "fg-subtle", cls: "bg-fg-subtle", role: "Timestamps" },
    ],
  },
  {
    title: "Action",
    note: "The ink primary, the one live signal, and danger.",
    swatches: [
      { token: "ink", cls: "bg-ink", role: "Primary pill", on: { token: "on-ink", cls: "text-on-ink" } },
      { token: "ink-hover", cls: "bg-ink-hover", role: "Primary hover" },
      { token: "accent", cls: "bg-accent", role: "Next-up, links, focus", on: { token: "on-accent", cls: "text-on-accent" } },
      { token: "accent-strong", cls: "bg-accent-strong", role: "Accent pressed" },
      { token: "danger", cls: "bg-danger", role: "Destructive text" },
    ],
  },
  {
    title: "Lines",
    note: "Hairlines in ink alpha.",
    swatches: [
      { token: "border", cls: "bg-border", role: "Card hairline" },
      { token: "border-subtle", cls: "bg-border-subtle", role: "Dividers" },
      { token: "border-strong", cls: "bg-border-strong", role: "Input focus" },
    ],
  },
];

const ZONES = [
  { token: "zone-rest", solid: "bg-zone-rest", soft: "bg-zone-rest-soft", role: "Rest" },
  { token: "zone-building", solid: "bg-zone-building", soft: "bg-zone-building-soft", role: "Building" },
  { token: "zone-optimal", solid: "bg-zone-optimal", soft: "bg-zone-optimal-soft", role: "Optimal" },
  { token: "zone-max", solid: "bg-zone-max", soft: "bg-zone-max-soft", role: "Max" },
] as const;

const RADII = [
  { token: "tile", cls: "rounded-tile" },
  { token: "control", cls: "rounded-control" },
  { token: "callout", cls: "rounded-callout" },
  { token: "card", cls: "rounded-card" },
  { token: "sheet", cls: "rounded-sheet" },
  { token: "pill", cls: "rounded-pill" },
] as const;

const SHADOWS = [
  { token: "shadow-control", cls: "shadow-control", use: "Secondary button, thumb" },
  { token: "shadow-card", cls: "shadow-card", use: "Every card" },
  { token: "shadow-card-hover", cls: "shadow-card-hover", use: "Interactive lift" },
  { token: "shadow-pop", cls: "shadow-pop", use: "Dialogs, menus" },
] as const;

const VARIANTS = ["primary", "accent", "secondary", "ghost", "danger"] as const;
const SIZES = ["sm", "md", "lg"] as const;

const SECTIONS = [
  ["colour", "Colour"],
  ["type", "Type"],
  ["shape", "Shape & depth"],
  ["actions", "Actions"],
  ["surfaces", "Surfaces"],
  ["loading", "Loading & empty"],
  ["dialog", "Dialog & form"],
] as const;

/* ── Small page-local layout helpers (no new visual vocabulary) ─────────── */

function Section({ id, title, lede, children }: { id: string; title: string; lede: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <SectionHeading title={title} />
      <p className="-mt-1 mb-5 max-w-[60ch] text-card-desc text-fg-muted">{lede}</p>
      {children}
    </section>
  );
}

function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={"text-eyebrow font-medium text-fg-subtle " + (className ?? "")}>{children}</div>;
}

/* ── Example content, reused by the real cards and their skeletons ──────── */

const WEEK = [
  { day: "Tue", name: "Upper A", detail: "5 exercises · 18 sets", tone: "accent" as const, chip: "Next up" },
  { day: "Thu", name: "Lower A", detail: "4 exercises · 16 sets", tone: "neutral" as const, chip: "Planned" },
  { day: "Sat", name: "Upper B", detail: "5 exercises · 17 sets", tone: "neutral" as const, chip: "Planned" },
];

function NextSessionPanel() {
  return (
    <Panel className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <Label>Tuesday · Week 3</Label>
        <Chip tone="accent">Next up</Chip>
      </div>
      <div className="mt-3 text-card-title text-fg">Upper A</div>
      <div className="mt-1 text-card-desc text-fg-muted tabular-nums">5 exercises · 18 sets · RIR 2</div>
      <div className="mt-auto pt-5">
        <Button size="sm" trailingIcon={ArrowRight}>
          Start session
        </Button>
      </div>
    </Panel>
  );
}

function NextSessionSkeleton() {
  return (
    <Panel aria-busy="true" className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-6 w-[72px] rounded-pill" />
      </div>
      <Skeleton className="mt-3.5 h-5 w-24" />
      <Skeleton className="mt-2 h-4 w-48" />
      <div className="mt-auto pt-5">
        <Skeleton className="h-8 w-[128px] rounded-pill" />
      </div>
    </Panel>
  );
}

function WeekList() {
  return (
    <Panel padding="none">
      <ul className="divide-y divide-border-subtle">
        {WEEK.map((s) => (
          <li key={s.name} className="flex items-center gap-3 px-5 py-3.5 transition-colors first:rounded-t-card last:rounded-b-card hover:bg-hover">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-sunken text-meta font-medium text-fg-muted">
              {s.day}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-list text-fg">{s.name}</div>
              <div className="text-meta text-fg-muted tabular-nums">{s.detail}</div>
            </div>
            <Chip tone={s.tone}>{s.chip}</Chip>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function WeekListSkeleton() {
  return (
    <Panel padding="none" aria-busy="true">
      <ul className="divide-y divide-border-subtle">
        {WEEK.map((s, i) => (
          <li key={s.name} className="flex items-center gap-3 px-5 py-3.5">
            <Skeleton className="size-9 shrink-0 rounded-control" />
            <div className="min-w-0 flex-1">
              <Skeleton className={"h-4 " + (i === 1 ? "w-20" : "w-24")} />
              <Skeleton className="mt-1.5 h-3 w-36" />
            </div>
            <Skeleton className="h-6 w-16 rounded-pill" />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function StyleguidePage() {
  return (
    <>
      <PageHeader
        eyebrow="Design system · Light"
        title="Styleguide"
        description="Every token and kit component, rendered live from theme.css. DESIGN.md has the rules."
        actions={
          <ButtonLink href="/app" variant="secondary" size="sm" icon={ArrowLeft}>
            Back to Now
          </ButtonLink>
        }
      />

      <nav aria-label="Sections" className="mt-6 flex flex-wrap gap-x-5 gap-y-2">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="text-nav text-fg-muted transition-colors hover:text-accent">
            {label}
          </a>
        ))}
      </nav>

      {/* Wordmark */}
      <Panel padding="lg" className="mt-8 flex flex-wrap items-center justify-between gap-6">
        <div className="flex flex-wrap items-start gap-10">
          <div className="flex flex-col gap-3">
            <Label>Wordmark · md</Label>
            <Wordmark />
          </div>
          <div className="flex flex-col gap-3">
            <Label>Wordmark · lg</Label>
            <Wordmark size="lg" />
          </div>
        </div>
        <p className="max-w-[34ch] text-card-desc text-fg-muted">
          An ink tile carrying the Dumbbell, set beside the name. There&apos;s no logo file. Use the component everywhere.
        </p>
      </Panel>

      {/* Colour */}
      <Section
        id="colour"
        title="Colour"
        lede="Neutral by default. Accent is the one live signal, and the zone colours belong to data only. Values are read live from :root."
      >
        <div className="flex flex-col gap-4">
          {COLOR_GROUPS.map((g) => (
            <Panel key={g.title}>
              <div className="flex items-baseline justify-between gap-4">
                <div className="text-card-title text-fg">{g.title}</div>
                <div className="text-meta text-fg-subtle">{g.note}</div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 md:grid-cols-5">
                {g.swatches.map((s) => (
                  <div key={s.token} className="min-w-0">
                    <div className="overflow-hidden rounded-control border border-border bg-canvas">
                      <div className={"flex h-14 items-end px-2.5 pb-2 " + s.cls}>
                        {s.on ? <span className={"text-meta font-medium " + s.on.cls}>{s.on.token}</span> : null}
                      </div>
                    </div>
                    <div className="mt-2 truncate text-meta font-medium text-fg">{s.token}</div>
                    <div className="truncate text-meta text-fg-muted">{s.role}</div>
                    <TokenValue
                      name={`--color-${s.token}`}
                      className="block text-[12px] leading-4 break-all text-fg-subtle tabular-nums"
                    />
                    {s.on ? (
                      <TokenValue
                        name={`--color-${s.on.token}`}
                        prefix={s.on.token + " "}
                        className="block text-[12px] leading-4 break-all text-fg-subtle tabular-nums"
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            </Panel>
          ))}

          <Panel>
            <div className="flex items-baseline justify-between gap-4">
              <div className="text-card-title text-fg">Zones</div>
              <div className="text-meta text-fg-subtle">Data only. Solid for marks, soft for areas.</div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              {ZONES.map((z) => (
                <div key={z.token} className="min-w-0">
                  <div className={"flex h-14 items-end gap-1 rounded-control p-2 " + z.soft}>
                    <span className={"h-3 w-2 rounded-full " + z.solid} />
                    <span className={"h-6 w-2 rounded-full " + z.solid} />
                    <span className={"h-9 w-2 rounded-full " + z.solid} />
                  </div>
                  <div className="mt-2 text-meta font-medium text-fg">{z.token}</div>
                  <div className="text-meta text-fg-muted">{z.role}</div>
                  <TokenValue name={`--color-${z.token}`} className="block text-[12px] leading-4 text-fg-subtle tabular-nums" />
                  <TokenValue
                    name={`--color-${z.token}-soft`}
                    prefix="soft "
                    className="block text-[12px] leading-4 break-all text-fg-subtle tabular-nums"
                  />
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </Section>

      {/* Type */}
      <Section
        id="type"
        title="Type"
        lede="The system stack (SF Pro on Apple) is the only family, and size and weight carry the hierarchy. Numbers are set in tabular figures."
      >
        <Panel className="divide-y divide-border-subtle py-1">
          <TypeRow token="display" cls="text-display">
            Train. Adapt.
          </TypeRow>
          <TypeRow token="page-title" cls="text-page-title">
            Week 3 of 6
          </TypeRow>
          <TypeRow token="section" cls="text-section">
            This week
          </TypeRow>
          <TypeRow token="card-title" cls="text-card-title">
            Upper A
          </TypeRow>
          <TypeRow token="body" cls="text-body">
            The plan reflows when you miss a session. Nothing moves until you accept.
          </TypeRow>
          <TypeRow token="list" cls="text-list">
            Incline dumbbell press
          </TypeRow>
          <TypeRow token="card-desc" cls="text-card-desc text-fg-muted">
            5 exercises · 18 sets · RIR 2
          </TypeRow>
          <TypeRow token="nav" cls="text-nav">
            Analysis
          </TypeRow>
          <TypeRow token="meta" cls="text-meta text-fg-muted">
            Logged 2 hours ago
          </TypeRow>
          <TypeRow token="eyebrow" cls="text-eyebrow font-medium text-fg-subtle">
            Block 2 · Hypertrophy
          </TypeRow>
          <TypeRow token="stat" cls="text-stat tabular-nums">
            14,280 <span className="text-section text-fg-muted">kg</span>
          </TypeRow>
        </Panel>
      </Section>

      {/* Shape & depth */}
      <Section
        id="shape"
        title="Shape & depth"
        lede="Round, soft and low. Depth comes from a hairline plus a wide, faint shadow. These specimens sit directly on the canvas."
      >
        <Label className="mb-3">Radii</Label>
        <div className="grid grid-cols-3 gap-4 md:grid-cols-6">
          {RADII.map((r) => (
            <div key={r.token}>
              <div className={"h-16 border border-border-strong bg-surface-raised " + r.cls} />
              <div className="mt-2 text-meta font-medium text-fg">{r.token}</div>
              <TokenValue name={`--radius-${r.token}`} className="block text-[12px] leading-4 text-fg-subtle tabular-nums" />
            </div>
          ))}
        </div>

        <Label className="mt-10 mb-4">Shadows</Label>
        <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
          {SHADOWS.map((s) => (
            <div key={s.token} className={"rounded-card bg-surface-raised px-4 py-5 " + s.cls}>
              <div className="text-meta font-medium text-fg">{s.token}</div>
              <div className="mt-0.5 text-meta text-fg-muted">{s.use}</div>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Panel>
            <div className="text-card-title text-fg">Motion</div>
            <p className="mt-1 mb-4 text-card-desc text-fg-muted">
              Everything runs on ease-soft at 200–300ms, and entrances never overshoot.
            </p>
            <MotionDemo />
          </Panel>
          <Panel>
            <div className="text-card-title text-fg">Curves</div>
            <dl className="mt-3 divide-y divide-border-subtle">
              {[
                ["--ease-soft", "Every transition"],
                ["--ease-out", "Entrances, check-offs"],
                ["--default-transition-duration", "Default duration"],
                ["--animate-shimmer", "Skeleton"],
              ].map(([name, use]) => (
                <div key={name} className="flex flex-col gap-0.5 py-2.5">
                  <dt className="flex items-baseline justify-between gap-3">
                    <span className="text-meta font-medium text-fg">{name!.replace("--", "")}</span>
                    <span className="text-meta text-fg-muted">{use}</span>
                  </dt>
                  <dd>
                    <TokenValue name={name!} className="block truncate text-[12px] leading-4 text-fg-subtle tabular-nums" />
                  </dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>
      </Section>

      {/* Actions */}
      <Section
        id="actions"
        title="Actions"
        lede="Every button is a pill. Use one ink primary per view. Accent is only for the confirm on an accept-gate."
      >
        <Panel padding="lg">
          <div className="flex flex-col gap-5">
            {VARIANTS.map((v) => (
              <div key={v} className="grid items-center gap-3 md:grid-cols-[112px_1fr]">
                <Label>{v}</Label>
                <div className="flex flex-wrap items-center gap-3">
                  {SIZES.map((s) => (
                    <Button
                      key={s}
                      variant={v}
                      size={s}
                      icon={v === "danger" ? Trash2 : s === "lg" ? (v === "accent" ? Check : Plus) : undefined}
                    >
                      {v === "danger" ? "Delete block" : v === "accent" ? "Accept move" : `Button ${s}`}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
            <div className="border-t border-border-subtle pt-5">
              <div className="grid items-center gap-3 md:grid-cols-[112px_1fr]">
                <Label>Loading</Label>
                <div className="flex flex-wrap items-center gap-3">
                  <Button loading>Saving</Button>
                  <Button variant="accent" loading>
                    Accepting
                  </Button>
                  <Button variant="secondary" loading>
                    Loading
                  </Button>
                </div>
              </div>
            </div>
            <div className="grid items-center gap-3 md:grid-cols-[112px_1fr]">
              <Label>Disabled</Label>
              <div className="flex flex-wrap items-center gap-3">
                <Button disabled>Primary</Button>
                <Button variant="accent" disabled>
                  Accent
                </Button>
                <Button variant="secondary" disabled>
                  Secondary
                </Button>
                <Button variant="ghost" disabled>
                  Ghost
                </Button>
              </div>
            </div>
            <div className="grid items-center gap-3 md:grid-cols-[112px_1fr]">
              <Label>Icons</Label>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="secondary" icon={CalendarPlus}>
                  Leading
                </Button>
                <Button variant="ghost" trailingIcon={ArrowRight}>
                  Trailing
                </Button>
                <ButtonLink href="/app/block" variant="secondary" trailingIcon={ArrowRight}>
                  ButtonLink
                </ButtonLink>
              </div>
            </div>
            <div className="grid items-center gap-3 md:grid-cols-[112px_1fr]">
              <Label>IconButton</Label>
              <div className="flex items-center gap-1">
                <IconButton icon={X} aria-label="Close" />
                <IconButton icon={MoreHorizontal} aria-label="More" />
                <IconButton icon={Plus} aria-label="Add" />
              </div>
            </div>
          </div>
        </Panel>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Panel>
            <div className="text-card-title text-fg">Chips</div>
            <p className="mt-1 text-card-desc text-fg-muted">Neutral and accent for status. Zone tones for data states.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Chip>Planned</Chip>
              <Chip tone="accent">Next up</Chip>
              <Chip tone="rest">Rest</Chip>
              <Chip tone="building">Building</Chip>
              <Chip tone="optimal">Optimal</Chip>
              <Chip tone="max">Max</Chip>
              <Chip icon={Check}>Logged</Chip>
              <Chip tone="accent" icon={CalendarPlus}>
                Moved
              </Chip>
            </div>
          </Panel>
          <Panel>
            <div className="text-card-title text-fg">Segmented</div>
            <p className="mt-1 mb-4 text-card-desc text-fg-muted">For 2–4 exclusive views. Try it.</p>
            <SegmentedDemo />
          </Panel>
        </div>
      </Section>

      {/* Surfaces */}
      <Section
        id="surfaces"
        title="Surfaces"
        lede="Panel is the one card surface. It never holds another shadowed card, so group inside it with wells, dividers and space."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Panel>
            <Label>Panel</Label>
            <div className="mt-2 text-card-title text-fg">Training status</div>
            <p className="mt-1 text-card-desc text-fg-muted">Static content surface. Hairline, soft wide shadow, 20px radius.</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                ["Sets", "62"],
                ["Volume", "14.3t"],
                ["Avg RIR", "2.1"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-control bg-sunken px-3 py-2.5">
                  <div className="text-meta text-fg-muted">{k}</div>
                  <div className="text-card-title text-fg tabular-nums">{v}</div>
                </div>
              ))}
            </div>
          </Panel>
          <Panel interactive className="cursor-pointer">
            <Label>Panel · interactive</Label>
            <div className="mt-2 text-card-title text-fg">Hover me</div>
            <p className="mt-1 text-card-desc text-fg-muted">
              Lifts 1px with a deeper shadow over 300ms. Use it for whole-card click targets only.
            </p>
            <div className="mt-4 flex items-center gap-1.5 text-nav text-accent">
              Open readiness <ArrowRight className="size-4" aria-hidden />
            </div>
          </Panel>
        </div>

        <Label className="mt-8 mb-3">Card · filled</Label>
        <div className="grid gap-4 md:grid-cols-2">
          <Card variant="filled" icon={LineChart} title="Analysis" description="Volume against your landmarks, by muscle and week." href="/app/analysis" />
          <Card variant="filled" icon={HeartPulse} title="Readiness" description="Fitness, fatigue and form across the block." href="/app/readiness" />
        </div>

        <Label className="mt-8 mb-2">Card · ghost</Label>
        <div className="grid gap-x-6 md:grid-cols-2">
          <Card variant="ghost" icon={BookOpen} title="Exercise library" description="Every movement the engine can program." href="/app/library" />
          <Card variant="ghost" icon={Dumbbell} title="Current block" description="Six weeks of Upper / Lower, week 3." href="/app/block" />
        </div>

        <Label className="mt-8 mb-3">Callout</Label>
        <Callout icon={Info}>
          Thursday is blocked, so the coach has a proposal for your week. Nothing changes until you accept it.
        </Callout>
      </Section>

      {/* Loading & empty */}
      <Section
        id="loading"
        title="Loading & empty"
        lede="Skeletons copy the real card's shape, padding and line lengths. There's no page spinner."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label>Skeleton</Label>
            <NextSessionSkeleton />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Loaded</Label>
            <NextSessionPanel />
          </div>
          <div className="flex flex-col gap-2">
            <WeekListSkeleton />
          </div>
          <div className="flex flex-col gap-2">
            <WeekList />
          </div>
        </div>

        <Label className="mt-8 mb-3">Empty state</Label>
        <Panel padding="lg" className="flex flex-col items-center py-12 text-center">
          <span className="flex size-10 items-center justify-center rounded-control bg-aura text-fg-soft">
            <CalendarPlus className="size-5" aria-hidden />
          </span>
          <div className="mt-4 text-card-title text-fg">No sessions logged yet</div>
          <p className="mt-1 max-w-[36ch] text-card-desc text-fg-muted">
            Log your first session and your weekly volume shows up here.
          </p>
          <Button className="mt-5" size="sm" icon={Plus}>
            Log a session
          </Button>
        </Panel>
      </Section>

      {/* Dialog & form */}
      <Section
        id="dialog"
        title="Dialog & form"
        lede="A dialog is a raised sheet over a light scrim. On an accept-gate the confirm is accent; anywhere else it's ink. Cancel is always ghost."
      >
        <div className="relative overflow-hidden rounded-card border border-border bg-canvas">
          {/* Faux page behind the scrim */}
          <div aria-hidden className="bg-atmosphere flex flex-col gap-3 p-6">
            <Skeleton className="h-3 w-24 animate-none" />
            <Skeleton className="h-7 w-48 animate-none" />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="h-28 rounded-card border border-border bg-surface" />
              <div className="h-28 rounded-card border border-border bg-surface" />
            </div>
            <div className="h-24 rounded-card border border-border bg-surface" />
          </div>
          <div className="absolute inset-0 grid place-items-center bg-scrim p-4 backdrop-blur-[2px]">
            <div
              role="dialog"
              aria-modal="false"
              aria-labelledby="sg-dialog-title"
              className="w-full max-w-[420px] animate-rise rounded-sheet bg-surface-raised p-6 shadow-pop"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 id="sg-dialog-title" className="text-card-title text-fg">
                    Move Lower A to Saturday?
                  </h3>
                  <p className="mt-1.5 text-card-desc text-fg-muted">
                    Thursday is blocked. This keeps 48 hours between lower sessions.
                  </p>
                </div>
                <IconButton icon={X} aria-label="Close" className="-mt-1 -mr-2" />
              </div>
              <div className="mt-5 flex items-center gap-3 rounded-control bg-sunken px-4 py-3 text-nav">
                <span className="text-fg-muted line-through">Thu · AM</span>
                <ArrowRight className="size-4 text-fg-subtle" aria-hidden />
                <span className="text-fg">Sat · AM</span>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <Button variant="ghost">Not now</Button>
                <Button variant="accent" icon={Check}>
                  Accept move
                </Button>
              </div>
            </div>
          </div>
        </div>

        <Panel padding="lg" className="mt-4">
          <div className="text-card-title text-fg">Form inputs</div>
          <p className="mt-1 text-card-desc text-fg-muted">
            A sunken well that turns white with a strong hairline on focus. Numbers are tabular.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-nav text-fg-soft">Top-set weight</span>
              <input
                inputMode="decimal"
                defaultValue="102.5"
                className="h-10 rounded-control border border-transparent bg-sunken px-3 text-body text-fg tabular-nums outline-none transition-colors placeholder:text-fg-subtle focus:border-border-strong focus:bg-surface-raised"
              />
              <span className="text-meta text-fg-muted">kg, as lifted</span>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-nav text-fg-soft">Reps</span>
              <input
                inputMode="numeric"
                placeholder="8"
                className="h-10 rounded-control border border-transparent bg-sunken px-3 text-body text-fg tabular-nums outline-none transition-colors placeholder:text-fg-subtle focus:border-border-strong focus:bg-surface-raised"
              />
              <span className="text-meta text-fg-muted">Target 8–10</span>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-nav text-fg-soft">Disabled</span>
              <input
                disabled
                defaultValue="RIR 2"
                className="h-10 rounded-control border border-transparent bg-sunken px-3 text-body text-fg-subtle outline-none disabled:opacity-60"
              />
              <span className="text-meta text-fg-muted">Set by the engine</span>
            </label>
          </div>
        </Panel>
      </Section>
    </>
  );
}
