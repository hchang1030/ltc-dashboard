import {
  useGetPhysicianSummary,
  getGetPhysicianSummaryQueryKey,
  useListBowelMovements,
  useListBinderEntries,
  useResolveBinderEntry,
  useUndoBinderEntry,
  getListBinderEntriesQueryKey,
} from "@workspace/api-client-react";
import type { ResidentAlertSummary, BinderEntry } from "@workspace/api-client-react";
import {
  Clock,
  RefreshCw,
  AlertTriangle,
  Droplets,
  CalendarX,
  X,
  ChevronRight,
  Droplet,
  Activity,
  Megaphone,
  CheckCircle2,
  Undo2,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

// ── helpers ──────────────────────────────────────────────────────────────────

function formatHours(hours: number | null): string {
  if (hours === null) return "No record";
  if (hours < 1) return "< 1 hour ago";
  if (hours < 24) return `${Math.round(hours)}h ago`;
  const days = Math.floor(hours / 24);
  const rem = Math.round(hours % 24);
  return rem > 0 ? `${days}d ${rem}h ago` : `${days}d ago`;
}

function formatLastBM(val: string | Date | null): string {
  if (!val) return "Never recorded";
  return new Date(val).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatFull(val: string | Date): string {
  return new Date(val).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

const BRISTOL_COLORS: Record<number, { dot: string; label: string; text: string }> = {
  1: { dot: "bg-[#2d1b11]", label: "Separate hard lumps", text: "text-white" },
  2: { dot: "bg-[#3e2723]", label: "Lumpy sausage",       text: "text-white" },
  3: { dot: "bg-[#5d4037]", label: "Cracked surface",     text: "text-white" },
  4: { dot: "bg-[#795548]", label: "Smooth & soft",       text: "text-white" },
  5: { dot: "bg-[#bcaaa4]", label: "Soft blobs",          text: "text-[#1a1a1a]" },
  6: { dot: "bg-[#d7ccc8]", label: "Fluffy pieces",       text: "text-[#1a1a1a]" },
  7: { dot: "bg-[#efebe9]", label: "Entirely liquid",     text: "text-[#1a1a1a]" },
};

// ── Drill-down Panel ──────────────────────────────────────────────────────────

interface DrillPanelProps {
  resident: ResidentAlertSummary | null;
  onClose: () => void;
}

function DrillPanel({ resident, onClose }: DrillPanelProps) {
  const isOpen = resident !== null;

  const { data: events = [], isLoading } = useListBowelMovements(
    { residentId: resident?.residentId },
    { query: { enabled: !!resident, queryKey: [`/api/bowel-movements`, { residentId: resident?.residentId }] } },
  );

  // sorted newest first
  const sorted = [...events].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  // close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const isRed   = resident?.alertLevel === "red";
  const isAmber = resident?.alertLevel === "amber";
  const nameCls = isRed ? "text-red-400" : isAmber ? "text-amber-400" : "text-foreground";
  const alertDot = isRed ? "bg-red-500" : isAmber ? "bg-amber-400" : "bg-emerald-500";

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={[
          "fixed inset-0 z-40 bg-black/50 transition-opacity duration-300",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        ].join(" ")}
        data-testid="drill-backdrop"
      />

      {/* Side panel */}
      <aside
        data-testid="drill-panel"
        className={[
          "fixed top-0 right-0 h-full w-[520px] max-w-full bg-card border-l border-border z-50",
          "flex flex-col shadow-2xl transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        {/* Panel header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <span className={["w-3 h-3 rounded-full mt-1 shrink-0", alertDot].join(" ")} />
            <div>
              <h2 className={["text-xl font-bold", nameCls].join(" ")}>
                {resident?.name ?? "—"}
              </h2>
              <p className="text-sm text-muted-foreground">
                Room {resident?.room} &nbsp;·&nbsp; Bowel Movement History
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            data-testid="btn-drill-close"
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Alert strip */}
        {resident && (
          <div
            className={[
              "px-6 py-3 text-sm font-semibold flex items-center gap-2 shrink-0",
              isRed
                ? "bg-red-950/60 text-red-400 border-b border-red-900/40"
                : isAmber
                ? "bg-amber-950/50 text-amber-400 border-b border-amber-900/40"
                : "bg-emerald-950/30 text-emerald-400 border-b border-emerald-900/30",
            ].join(" ")}
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {resident.lastBMAt
              ? `Last BM: ${formatHours(resident.hoursSinceLastBM)} — ${formatLastBM(resident.lastBMAt)}`
              : "No bowel movement on record"}
          </div>
        )}

        {/* Monthly badges */}
        {resident && (
          <div className="flex gap-3 px-6 py-4 border-b border-border shrink-0">
            <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2">
              <CalendarX className="w-4 h-4 text-amber-400" />
              <span className="text-amber-400 font-bold text-sm">{resident.monthlyGapCount}</span>
              <span className="text-muted-foreground text-xs">48h gaps (mo.)</span>
            </div>
            <div className="flex items-center gap-2 bg-red-600/10 border border-red-600/25 rounded-lg px-3 py-2">
              <Droplet className="w-4 h-4 text-red-400" />
              <span className="text-red-400 font-bold text-sm">{resident.monthlyBloodCount}</span>
              <span className="text-muted-foreground text-xs">blood events (mo.)</span>
            </div>
            <div className="flex items-center gap-2 bg-primary/10 border border-primary/25 rounded-lg px-3 py-2">
              <Activity className="w-4 h-4 text-primary" />
              <span className="text-primary font-bold text-sm">{events.length}</span>
              <span className="text-muted-foreground text-xs">total recorded</span>
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {isLoading && (
            <p className="text-muted-foreground text-center py-12">Loading history...</p>
          )}

          {!isLoading && sorted.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="bg-muted/40 p-5 rounded-full">
                <Activity className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <p className="text-muted-foreground font-medium">No bowel movements recorded yet</p>
              <p className="text-muted-foreground/60 text-sm">
                Use the Care Aide view to log the first entry.
              </p>
            </div>
          )}

          {sorted.map((bm, idx) => {
            const bristol = BRISTOL_COLORS[bm.bristolType] ?? BRISTOL_COLORS[4];
            const hasFlags = bm.incontinence || bm.bloodPresent || bm.mucusPresent || bm.painStraining;
            const isFirst = idx === 0;

            return (
              <div
                key={bm.id}
                data-testid={`drill-event-${bm.id}`}
                className={[
                  "rounded-xl border p-4 space-y-3",
                  isFirst ? "border-primary/40 bg-primary/5" : "border-border bg-background/60",
                ].join(" ")}
              >
                {/* Top row: timestamp + type badge */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-muted-foreground">
                    {formatFull(bm.createdAt)}
                    {isFirst && (
                      <span className="ml-2 text-primary font-bold uppercase tracking-wider text-[10px] bg-primary/15 px-2 py-0.5 rounded-full">
                        Most recent
                      </span>
                    )}
                  </span>
                </div>

                {/* Bristol + Amount row */}
                <div className="flex items-center gap-3">
                  <div
                    className={[
                      "w-10 h-10 rounded-full flex items-center justify-center font-bold text-base shrink-0",
                      bristol.dot,
                      bristol.text,
                    ].join(" ")}
                  >
                    {bm.bristolType}
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-sm">
                      Type {bm.bristolType} &nbsp;·&nbsp; {bristol.label}
                    </p>
                    <p className="text-muted-foreground text-sm">Amount: <span className="font-medium text-foreground">{bm.amount}</span></p>
                  </div>
                </div>

                {/* Clinical flags */}
                {hasFlags && (
                  <div className="flex flex-wrap gap-2">
                    {bm.incontinence && (
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        Incontinence
                      </span>
                    )}
                    {bm.bloodPresent && (
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-600/20 text-red-400 border border-red-600/30">
                        Blood Present
                      </span>
                    )}
                    {bm.mucusPresent && (
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                        Mucus Present
                      </span>
                    )}
                    {bm.painStraining && (
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">
                        Pain / Straining
                      </span>
                    )}
                  </div>
                )}

                {/* Clinical note */}
                {bm.clinicalNote && (
                  <p className="text-xs font-mono text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 leading-relaxed border border-border/50">
                    {bm.clinicalNote}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
}

// ── Virtual Binder ────────────────────────────────────────────────────────────

function formatElapsed(timestamp: string | Date): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function BinderCard({
  entry,
  onResolve,
  onUndo,
  isPending,
}: {
  entry: BinderEntry;
  onResolve?: () => void;
  onUndo?: () => void;
  isPending: boolean;
}) {
  const isResolved = entry.status === "Resolved";

  return (
    <div className={[
      "rounded-xl border p-5 space-y-3 transition-all",
      isResolved ? "border-border/40 bg-background/40 opacity-80" : "border-sky-700/40 bg-sky-950/20",
    ].join(" ")}>
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={["font-bold text-base", isResolved ? "text-muted-foreground" : "text-foreground"].join(" ")}>
              {entry.residentName}
            </span>
            <span className="font-mono text-xs bg-muted/60 border border-border px-2 py-0.5 rounded text-muted-foreground">
              Room {entry.residentRoom}
            </span>
          </div>
          <p className="text-xs text-muted-foreground font-mono">{formatElapsed(entry.timestamp)}</p>
        </div>
        {!isResolved && onResolve && (
          <button
            onClick={onResolve}
            disabled={isPending}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-sm bg-emerald-900/40 border border-emerald-700/50 text-emerald-300 hover:bg-emerald-800/50 transition-colors disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            Mark Resolved
          </button>
        )}
        {isResolved && onUndo && (
          <button
            onClick={onUndo}
            disabled={isPending}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-sm bg-muted/40 border border-border text-muted-foreground hover:bg-muted/60 transition-colors disabled:opacity-50"
          >
            <Undo2 className="w-4 h-4" />
            Undo
          </button>
        )}
      </div>

      {/* Message */}
      <p className={[
        "text-sm leading-relaxed px-4 py-3 rounded-lg border",
        isResolved
          ? "line-through text-muted-foreground/60 bg-muted/20 border-border/30"
          : "text-foreground bg-card border-border/50",
      ].join(" ")}>
        {entry.messageText}
      </p>

      {isResolved && entry.resolvedTimestamp && (
        <p className="text-xs text-muted-foreground/50 font-mono">
          Resolved {formatElapsed(entry.resolvedTimestamp)}
        </p>
      )}
    </div>
  );
}

function VirtualBinder() {
  const [binderTab, setBinderTab] = useState<"Active" | "Resolved">("Active");
  const queryClient = useQueryClient();

  const { data: entries = [], isLoading, refetch, isFetching } = useListBinderEntries(
    { status: binderTab },
    { query: { queryKey: getListBinderEntriesQueryKey({ status: binderTab }), refetchInterval: 30_000 } },
  );

  const resolve = useResolveBinderEntry();
  const undo = useUndoBinderEntry();

  const handleResolve = (id: number) => {
    resolve.mutate({ messageId: id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListBinderEntriesQueryKey() });
      },
    });
  };

  const handleUndo = (id: number) => {
    undo.mutate({ messageId: id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListBinderEntriesQueryKey() });
      },
    });
  };

  return (
    <section className="space-y-5">
      {/* Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setBinderTab("Active")}
          className={[
            "flex-1 py-3 rounded-xl font-bold text-sm uppercase tracking-wider border-2 transition-all flex items-center justify-center gap-2",
            binderTab === "Active"
              ? "bg-sky-700/40 border-sky-500 text-sky-200 shadow-md"
              : "bg-card border-border text-muted-foreground hover:border-sky-500/40",
          ].join(" ")}
        >
          <Megaphone className="w-4 h-4" />
          Active Issues
        </button>
        <button
          onClick={() => setBinderTab("Resolved")}
          className={[
            "flex-1 py-3 rounded-xl font-bold text-sm uppercase tracking-wider border-2 transition-all flex items-center justify-center gap-2",
            binderTab === "Resolved"
              ? "bg-emerald-900/40 border-emerald-600 text-emerald-300 shadow-md"
              : "bg-card border-border text-muted-foreground hover:border-emerald-600/40",
          ].join(" ")}
        >
          <CheckCircle2 className="w-4 h-4" />
          Resolved Issues
        </button>
      </div>

      {/* Refresh row */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {binderTab === "Active" ? "Active messages awaiting physician review" : "Resolved — crossed off the binder"}
        </h2>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors text-xs disabled:opacity-50"
        >
          <RefreshCw className={["w-3.5 h-3.5", isFetching ? "animate-spin" : ""].join(" ")} />
          Refresh
        </button>
      </div>

      {/* List */}
      {isLoading && (
        <div className="text-center py-12 text-muted-foreground">Loading binder entries...</div>
      )}

      {!isLoading && entries.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center bg-card border border-border rounded-xl">
          <div className="bg-muted/40 p-5 rounded-full">
            {binderTab === "Active"
              ? <Megaphone className="w-8 h-8 text-muted-foreground/50" />
              : <CheckCircle2 className="w-8 h-8 text-muted-foreground/50" />}
          </div>
          <p className="text-muted-foreground font-medium">
            {binderTab === "Active" ? "No active messages" : "No resolved messages"}
          </p>
          <p className="text-muted-foreground/60 text-sm">
            {binderTab === "Active"
              ? "Care aides can send messages from the resident module hub."
              : "Resolved messages will appear here."}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {entries.map((entry) => (
          <BinderCard
            key={entry.id}
            entry={entry}
            onResolve={binderTab === "Active" ? () => handleResolve(entry.id) : undefined}
            onUndo={binderTab === "Resolved" ? () => handleUndo(entry.id) : undefined}
            isPending={resolve.isPending || undo.isPending}
          />
        ))}
      </div>
    </section>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function PhysicianDashboard() {
  const [time, setTime] = useState(new Date());
  const [selectedResident, setSelectedResident] = useState<ResidentAlertSummary | null>(null);
  const [view, setView] = useState<"population" | "binder">("population");

  const { data, isLoading, isError, refetch, isFetching } = useGetPhysicianSummary({
    query: { refetchInterval: 60_000, queryKey: getGetPhysicianSummaryQueryKey() },
  });

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleClose = useCallback(() => setSelectedResident(null), []);

  const alertCounts = data
    ? {
        red:   data.residents.filter((r) => r.alertLevel === "red").length,
        amber: data.residents.filter((r) => r.alertLevel === "amber").length,
        none:  data.residents.filter((r) => r.alertLevel === "none").length,
      }
    : null;

  const monthName = time.toLocaleString("en-US", { month: "long" });

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-card border-b border-border px-6 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <span className="font-bold text-lg text-foreground">Physician View</span>
          <span className="text-muted-foreground text-sm">— Population Health</span>
        </div>
        <div className="flex items-center gap-4">
          {data && (
            <span className="text-xs text-muted-foreground font-mono">
              Updated {new Date(data.generatedAt).toLocaleTimeString("en-US", { hour12: false })}
            </span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="btn-refresh"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors text-sm disabled:opacity-50"
          >
            <RefreshCw className={["w-4 h-4", isFetching ? "animate-spin" : ""].join(" ")} />
            Refresh
          </button>
          <div className="flex items-center gap-2 font-mono text-lg tabular-nums text-foreground">
            <Clock className="w-4 h-4 text-muted-foreground" />
            {time.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
        </div>
      </header>

      {/* View Tabs */}
      <div className="sticky top-[57px] z-20 bg-background border-b border-border px-6 py-3">
        <div className="max-w-7xl mx-auto flex gap-2">
          <button
            onClick={() => setView("population")}
            className={[
              "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm border-2 transition-all",
              view === "population"
                ? "bg-primary/15 border-primary text-primary shadow-sm"
                : "bg-card border-border text-muted-foreground hover:border-primary/40",
            ].join(" ")}
          >
            <Activity className="w-4 h-4" />
            Population Health
          </button>
          <button
            onClick={() => setView("binder")}
            className={[
              "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm border-2 transition-all",
              view === "binder"
                ? "bg-sky-700/20 border-sky-500 text-sky-300 shadow-sm"
                : "bg-card border-border text-muted-foreground hover:border-sky-500/40",
            ].join(" ")}
          >
            <Megaphone className="w-4 h-4" />
            Virtual Binder
          </button>
        </div>
      </div>

      <main className="max-w-7xl mx-auto p-8 space-y-8">
        {view === "binder" && <VirtualBinder />}

        {view === "population" && alertCounts && (
          <section className="grid grid-cols-3 gap-4">
            <div className="bg-card border-2 border-red-600/40 rounded-xl p-5 flex items-center gap-4" data-testid="card-alert-red">
              <div className="bg-red-600/15 p-3 rounded-full">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <p className="text-3xl font-bold text-red-500">{alertCounts.red}</p>
                <p className="text-sm text-muted-foreground uppercase tracking-wider font-medium">Over 72 Hours</p>
              </div>
            </div>
            <div className="bg-card border-2 border-amber-500/40 rounded-xl p-5 flex items-center gap-4" data-testid="card-alert-amber">
              <div className="bg-amber-500/15 p-3 rounded-full">
                <AlertTriangle className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <p className="text-3xl font-bold text-amber-400">{alertCounts.amber}</p>
                <p className="text-sm text-muted-foreground uppercase tracking-wider font-medium">48–72 Hours</p>
              </div>
            </div>
            <div className="bg-card border-2 border-emerald-500/40 rounded-xl p-5 flex items-center gap-4" data-testid="card-alert-none">
              <div className="bg-emerald-500/15 p-3 rounded-full">
                <AlertTriangle className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <p className="text-3xl font-bold text-emerald-400">{alertCounts.none}</p>
                <p className="text-sm text-muted-foreground uppercase tracking-wider font-medium">Within 48 Hours</p>
              </div>
            </div>
          </section>
        )}

        {/* Resident Summary Table */}
        {view === "population" && <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Resident Status — Click any row to view full history
          </h2>

          {isLoading && (
            <div className="bg-card rounded-xl border border-border p-12 text-center text-muted-foreground">
              Loading resident data...
            </div>
          )}

          {isError && (
            <div className="bg-card rounded-xl border border-red-600/30 p-12 text-center text-red-400">
              Failed to load data. Please refresh.
            </div>
          )}

          {data && (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <table className="w-full" data-testid="table-residents">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {["Alert", "Resident", "Room", "Last BM", "Elapsed", "48h Gaps (Mo.)", "Blood Events (Mo.)", "Clinical Alerts (24h)", ""].map((h) => (
                      <th
                        key={h}
                        className="text-left px-6 py-4 text-xs uppercase tracking-widest text-muted-foreground font-bold last:w-8"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.residents.map((resident, idx) => {
                    const isRed   = resident.alertLevel === "red";
                    const isAmber = resident.alertLevel === "amber";
                    const isSelected = selectedResident?.residentId === resident.residentId;

                    const rowBg = isSelected
                      ? "bg-primary/10 border-l-4 border-l-primary"
                      : isRed
                      ? "bg-red-950/40"
                      : isAmber
                      ? "bg-amber-950/30"
                      : "";

                    const nameCls = isRed
                      ? "text-red-400 font-bold"
                      : isAmber
                      ? "text-amber-400 font-bold"
                      : "text-foreground font-semibold";

                    const alertDot = isRed
                      ? "bg-red-500"
                      : isAmber
                      ? "bg-amber-400"
                      : "bg-emerald-500";

                    return (
                      <tr
                        key={resident.residentId}
                        data-testid={`row-resident-${resident.residentId}`}
                        onClick={() => setSelectedResident(isSelected ? null : resident)}
                        className={[
                          rowBg,
                          idx < data.residents.length - 1 ? "border-b border-border/50" : "",
                          "cursor-pointer hover:bg-primary/5 transition-colors group",
                        ].join(" ")}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center">
                            <span className={["w-3 h-3 rounded-full", alertDot].join(" ")} data-testid={`alert-dot-${resident.residentId}`} />
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span className={nameCls} data-testid={`name-resident-${resident.residentId}`}>
                            {resident.name}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-muted-foreground font-mono">{resident.room}</td>
                        <td className="px-6 py-5 text-sm text-muted-foreground font-mono">
                          {formatLastBM(resident.lastBMAt)}
                        </td>
                        <td className="px-6 py-5">
                          <span className={["text-sm font-semibold font-mono", isRed ? "text-red-400" : isAmber ? "text-amber-400" : "text-muted-foreground"].join(" ")}>
                            {formatHours(resident.hoursSinceLastBM)}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-center">
                          <span className={["text-lg font-bold", resident.monthlyGapCount > 0 ? "text-amber-400" : "text-muted-foreground"].join(" ")}>
                            {resident.monthlyGapCount}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-center">
                          <span className={["text-lg font-bold", resident.monthlyBloodCount > 0 ? "text-red-400" : "text-muted-foreground"].join(" ")}>
                            {resident.monthlyBloodCount}
                          </span>
                        </td>
                        <td className="px-4 py-5">
                          <div className="flex items-center gap-0.5 flex-wrap min-w-[80px]">
                            {(isRed || isAmber) && (
                              <span title={`No BM for ${resident.hoursSinceLastBM !== null ? Math.round(resident.hoursSinceLastBM) : "?"}h`} className="text-lg leading-none">💩</span>
                            )}
                            {resident.hasSeverePain && (
                              <span title="Severe pain recorded in last 24h" className="text-lg leading-none">💥</span>
                            )}
                            {resident.behaviorEventCount24h >= 2 && (
                              <span title={`${resident.behaviorEventCount24h} behavior events in last 24h`} className="text-lg leading-none">🧠</span>
                            )}
                            {resident.hasFall24h && (
                              <span title="Fall event recorded in last 24h" className="text-lg leading-none">⚠️</span>
                            )}
                            {resident.hasAbnormalVital24h && (
                              <span title="Abnormal vitals in last 24h" className="text-lg leading-none">📉</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-5">
                          <ChevronRight className={["w-4 h-4 text-muted-foreground/40 transition-transform group-hover:text-primary", isSelected ? "rotate-180 text-primary" : ""].join(" ")} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>}

        {/* Monthly Facility Stats */}
        {view === "population" && data && (
          <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Facility Statistics — {monthName} {time.getFullYear()}
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-card border-2 border-amber-500/30 rounded-xl p-6 flex items-center gap-5" data-testid="stat-monthly-gaps">
                <div className="bg-amber-500/15 p-4 rounded-full">
                  <CalendarX className="w-7 h-7 text-amber-400" />
                </div>
                <div>
                  <p className="text-4xl font-bold text-amber-400">{data.facilityMonthlyGaps}</p>
                  <p className="text-sm text-muted-foreground font-medium mt-1">48-hour gaps this month</p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">Intervals between BMs exceeding 48 hours</p>
                </div>
              </div>
              <div className="bg-card border-2 border-red-600/30 rounded-xl p-6 flex items-center gap-5" data-testid="stat-monthly-blood">
                <div className="bg-red-600/15 p-4 rounded-full">
                  <Droplets className="w-7 h-7 text-red-500" />
                </div>
                <div>
                  <p className="text-4xl font-bold text-red-500">{data.facilityMonthlyBlood}</p>
                  <p className="text-sm text-muted-foreground font-medium mt-1">Blood present events this month</p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">Facility-wide across all residents</p>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Drill-down panel */}
      <DrillPanel resident={selectedResident} onClose={handleClose} />
    </div>
  );
}
