import { useState, useEffect, useMemo, useRef, useCallback, createContext, useContext } from "react";
import type { ReactNode } from "react";
import {
  Clock, Star, ChevronRight, ArrowLeft, Search, X,
  Droplets, Zap, Brain, Utensils, AlertOctagon, Activity, Megaphone,
  FileText, MessageCircle, Send, BookOpen,
  Clipboard, Trash2, Pencil, Check, Mic, Loader2,
  ShieldAlert, AlertTriangle, Pill, HelpCircle, ChevronDown,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PatientOverlay } from "@/components/PatientOverlay";
import type { OverlayResident } from "@/components/PatientOverlay";
import { FrontlineCommBinder, CommHubView } from "./PhysicianDashboard";
import { getMockPRNLaxCount, getMockPRNAntipsychoticCount, getMockFalls } from "@/data/mockData";
import {
  useListResidents,
  useToggleFavorite,
  useUpdateResidentStability,
  useCreateBowelMovement,
  useCreatePainEvent,
  useCreateBehaviorEvent,
  useCreateIntakeEvent,
  useCreateFallEvent,
  useCreateVitalEvent,
  useCreateBinderEntry,
  getListBinderEntriesQueryKey,
  useGetPhysicianSummary,
  getGetPhysicianSummaryQueryKey,
  getListResidentsQueryKey,
  useListMedicationTrackers,
  useConfirmTaperStarted,
  getListMedicationTrackersQueryKey,
} from "@workspace/api-client-react";
import type { Resident } from "@workspace/api-client-react";
import type { PainEventInputSeverity, PainEventInputLocation, BehaviorEventInputType, IntakeEventInputMealPercent } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

// ── Types ─────────────────────────────────────────────────────────────────────

type ViewState = "list" | "hub" | "bowel" | "pain" | "behavior" | "intake" | "falls" | "vitals" | "message";
type StoolType = 1 | 2 | 3 | 4 | 5 | 6 | 7 | null;
type Amount = "Small" | "Medium" | "Large" | "XL" | null;
type ViewFilter = "all" | "favorites";
interface BowelFlags { incontinence: boolean; blood: boolean; mucus: boolean; pain: boolean; }

// ── Notes Queue ───────────────────────────────────────────────────────────────

interface NoteItem {
  id: string;
  patientName: string;
  roomNumber: string;
  content: string;
  timestamp: Date;
}

interface NotesQueueContextValue {
  notesQueue: NoteItem[];
  addNote: (n: Omit<NoteItem, "id" | "timestamp">) => void;
  removeNote: (id: string) => void;
  editNote: (id: string, content: string) => void;
}

const NotesQueueContext = createContext<NotesQueueContextValue>({
  notesQueue: [], addNote: () => {}, removeNote: () => {}, editNote: () => {},
});

function useNotesQueue() { return useContext(NotesQueueContext); }

function NotesQueueProvider({ children }: { children: ReactNode }) {
  const [notesQueue, setNotesQueue] = useState<NoteItem[]>([]);
  const addNote = useCallback((n: Omit<NoteItem, "id" | "timestamp">) => {
    setNotesQueue((prev) => [{ ...n, id: crypto.randomUUID(), timestamp: new Date() }, ...prev]);
  }, []);
  const removeNote = useCallback((id: string) => {
    setNotesQueue((prev) => prev.filter((n) => n.id !== id));
  }, []);
  const editNote = useCallback((id: string, content: string) => {
    setNotesQueue((prev) => prev.map((n) => n.id === id ? { ...n, content } : n));
  }, []);
  return (
    <NotesQueueContext.Provider value={{ notesQueue, addNote, removeNote, editNote }}>
      {children}
    </NotesQueueContext.Provider>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STOOL_TYPES = [
  { id: 1, desc: "Separate hard lumps", color: "bg-[#2d1b11]", text: "text-white" },
  { id: 2, desc: "Lumpy sausage",       color: "bg-[#3e2723]", text: "text-white" },
  { id: 3, desc: "Cracked surface",     color: "bg-[#5d4037]", text: "text-white" },
  { id: 4, desc: "Smooth & soft",       color: "bg-[#795548]", text: "text-white" },
  { id: 5, desc: "Soft blobs",          color: "bg-[#bcaaa4]", text: "text-[#1a1a1a]" },
  { id: 6, desc: "Fluffy pieces",       color: "bg-[#d7ccc8]", text: "text-[#1a1a1a]" },
  { id: 7, desc: "Entirely liquid",     color: "bg-[#efebe9]", text: "text-[#1a1a1a]" },
] as const;

const PAIN_SEVERITIES = [
  { label: "None",     value: "None",     bg: "bg-slate-700",  border: "border-slate-500",  text: "text-slate-100" },
  { label: "Mild",     value: "Mild",     bg: "bg-yellow-700", border: "border-yellow-500", text: "text-yellow-100" },
  { label: "Moderate", value: "Moderate", bg: "bg-orange-700", border: "border-orange-500", text: "text-orange-100" },
  { label: "Severe",   value: "Severe",   bg: "bg-red-700",    border: "border-red-500",    text: "text-red-100" },
] as const;

const PAIN_LOCATIONS = ["Back", "Legs", "Chest", "Head", "Abdomen", "Other"] as const;
const BEHAVIOR_TYPES = ["Agitation", "Physical", "Verbal", "Wandering", "Refusing Care"] as const;
const BEHAVIOR_DURATIONS = [5, 10, 15, 30] as const;

// ── Date / Time helpers ───────────────────────────────────────────────────────

function getTodayDateStr() { return new Date().toISOString().split("T")[0]; }
function getCurrentHour() { return new Date().getHours(); }

function getDateItems() {
  const items: { label: string; value: string }[] = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const value = d.toISOString().split("T")[0];
    const label = i === 0
      ? `Today · ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
      : i === 1
      ? `Yesterday · ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
      : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    items.push({ label, value });
  }
  return items;
}

function getHourItems() {
  const items: { label: string; value: number }[] = [];
  for (let h = 0; h < 24; h++) {
    const period = h < 12 ? "AM" : "PM";
    const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
    items.push({ label: `${display} ${period}`, value: h });
  }
  return items;
}

const DATE_ITEMS = getDateItems();
const HOUR_ITEMS = getHourItems();
const ITEM_H = 68;

// ── ScrollPicker ──────────────────────────────────────────────────────────────

function ScrollPicker<T extends string | number>({
  items, value, onChange,
}: { items: { label: string; value: T }[]; value: T; onChange: (v: T) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const suppressRef = useRef(false);

  const scrollToReal = useCallback((realIdx: number, smooth = false) => {
    const el = containerRef.current;
    if (!el) return;
    suppressRef.current = true;
    el.scrollTo({ top: realIdx * ITEM_H, behavior: smooth ? "smooth" : "instant" });
    setTimeout(() => { suppressRef.current = false; }, 200);
  }, []);

  useEffect(() => {
    const idx = items.findIndex((i) => i.value === value);
    if (idx >= 0) scrollToReal(idx, false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScroll = useCallback(() => {
    if (suppressRef.current) return;
    const el = containerRef.current;
    if (!el) return;
    const realIdx = Math.max(0, Math.min(Math.round(el.scrollTop / ITEM_H), items.length - 1));
    if (items[realIdx].value !== value) onChange(items[realIdx].value);
  }, [items, value, onChange]);

  return (
    <div className="relative rounded-xl overflow-hidden bg-card border border-border" style={{ height: ITEM_H * 3 }}>
      <div className="absolute inset-x-0 top-0 pointer-events-none z-10"
        style={{ height: ITEM_H, background: "linear-gradient(to bottom, var(--card) 40%, transparent)" }} />
      <div className="absolute inset-x-0 bottom-0 pointer-events-none z-10"
        style={{ height: ITEM_H, background: "linear-gradient(to top, var(--card) 40%, transparent)" }} />
      <div className="absolute inset-x-0 z-10 pointer-events-none border-y-2 border-primary/40"
        style={{ top: ITEM_H, height: ITEM_H, background: "hsl(var(--primary) / 0.08)" }} />
      <div ref={containerRef} onScroll={handleScroll} className="absolute inset-0 overflow-y-scroll"
        style={{ scrollSnapType: "y mandatory", scrollbarWidth: "none" }}>
        <div style={{ height: ITEM_H, scrollSnapAlign: "none" }} />
        {items.map((item, i) => (
          <div key={i} style={{ height: ITEM_H, scrollSnapAlign: "center" }}
            className="flex items-center justify-center cursor-pointer select-none"
            onClick={() => { onChange(item.value); scrollToReal(i, true); }}>
            <span className={["font-bold transition-all duration-150 text-center px-2",
              item.value === value ? "text-foreground text-xl" : "text-muted-foreground/50 text-base"].join(" ")}>
              {item.label}
            </span>
          </div>
        ))}
        <div style={{ height: ITEM_H, scrollSnapAlign: "none" }} />
      </div>
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function GutBadge({ level }: { level: "none" | "amber" | "red" | "unknown" }) {
  if (level === "none")  return <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">Current</span>;
  if (level === "amber") return <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 whitespace-nowrap">48h+</span>;
  if (level === "red")   return <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-600/20 text-red-400 border border-red-600/30 whitespace-nowrap">72h+</span>;
  return <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-muted/60 text-muted-foreground border border-border whitespace-nowrap">No record</span>;
}

function buildRecordedAt(date: string, hour: number) {
  return new Date(`${date}T${String(hour).padStart(2, "0")}:00:00`).toISOString();
}

// ── FormShell — shared wrapper for all module forms ───────────────────────────

function FormShell({
  resident, title, badge, onBack, children, onReset, onSave, hasData, isSaving,
  saveLabel = "Save & Copy Note", theme = "default",
}: {
  resident: Resident; title: string; badge?: string; onBack: () => void;
  children: React.ReactNode; onReset: () => void; onSave: () => void;
  hasData: boolean; isSaving: boolean; saveLabel?: string;
  theme?: "default" | "emergency";
}) {
  const saveBg = theme === "emergency"
    ? "bg-red-600 hover:bg-red-500 shadow-red-600/30"
    : "bg-primary hover:bg-primary/90 shadow-primary/30";

  return (
    <div className="min-h-screen bg-background text-foreground pb-36">
      <header className="sticky top-0 z-30 bg-card border-b border-border px-4 py-3 flex items-center gap-4 shadow-md">
        <button onClick={onBack} className="flex items-center justify-center w-11 h-11 rounded-full hover:bg-muted transition-colors shrink-0">
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-base text-foreground leading-none truncate">{resident.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Room {resident.room} · {title}</p>
        </div>
        <span className="bg-primary/10 text-primary border border-primary/20 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest shrink-0">
          {badge ?? "Frontline Staff"}
        </span>
      </header>
      <main className="max-w-5xl mx-auto p-6 space-y-8">{children}</main>
      <footer className="fixed bottom-0 left-0 right-0 bg-card border-t border-border px-6 py-4 shadow-[0_-8px_24px_rgba(0,0,0,0.25)] z-50">
        <div className="max-w-5xl mx-auto flex gap-4">
          <button onClick={onReset} disabled={!hasData}
            className="w-[28%] min-h-[72px] rounded-xl font-bold text-base border-2 border-muted-foreground/50 text-muted-foreground hover:bg-muted disabled:opacity-40 transition-colors uppercase tracking-widest">
            Reset
          </button>
          <button onClick={onSave} disabled={isSaving}
            className={["w-[72%] min-h-[72px] rounded-xl font-bold text-xl text-white disabled:opacity-60 disabled:cursor-not-allowed transition-all uppercase tracking-widest shadow-lg", saveBg].join(" ")}>
            {isSaving ? "Saving..." : saveLabel}
          </button>
        </div>
      </footer>
    </div>
  );
}

// ── Section header helper ─────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{children}</h2>;
}

// ── ── ── Screen 1: Resident List ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──

const LEGEND_STORAGE_KEY = "ltc-resident-legend-open";

function ResidentList({ onSelect }: { onSelect: (r: Resident) => void }) {
  const [filter, setFilter] = useState<ViewFilter>("all");
  const [search, setSearch] = useState("");
  const [flagFilters, setFlagFilters] = useState<Set<string>>(new Set());
  const [time, setTime] = useState(new Date());
  const [showBinder, setShowBinder] = useState(false);
  const [showCommHub, setShowCommHub] = useState(false);
  const [showNotesQueue, setShowNotesQueue] = useState(false);
  const [showLegend, setShowLegend] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(LEGEND_STORAGE_KEY);
      return stored === null ? true : stored === "true";
    } catch {
      return true;
    }
  });
  const { notesQueue } = useNotesQueue();

  const toggleLegend = useCallback(() => {
    setShowLegend((prev) => {
      const next = !prev;
      try { localStorage.setItem(LEGEND_STORAGE_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: residents = [], isLoading } = useListResidents();
  const { data: summary } = useGetPhysicianSummary({
    query: { queryKey: getGetPhysicianSummaryQueryKey(), refetchInterval: 60_000 },
  });
  const toggleFav = useToggleFavorite();
  const updateStability = useUpdateResidentStability();

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const alertMap = useMemo<Partial<Record<number, "none" | "amber" | "red">>>(() => {
    const map: Partial<Record<number, "none" | "amber" | "red">> = {};
    for (const r of summary?.residents ?? []) map[r.residentId] = r.alertLevel;
    return map;
  }, [summary]);

  const FLAG_MATCHERS: Record<string, (r: Resident) => boolean> = {
    unstable: (r) => r.stabilityStatus === "unstable",
    watch: (r) => r.stabilityStatus === "watch",
    infection: (r) => (r.infectionFlags?.length ?? 0) > 0,
    fall: (r) => (r.recentFallCount ?? 0) > 0,
    med: (r) => (r.recentMedChangeCount ?? 0) > 0,
  };

  const baseList = useMemo(() => {
    if (filter === "favorites") return residents.filter((r) => r.isFavorited);
    return residents;
  }, [residents, filter]);

  const chipCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const key of Object.keys(FLAG_MATCHERS)) {
      counts[key] = baseList.filter(FLAG_MATCHERS[key]).length;
    }
    return counts;
  }, [baseList]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    let list = baseList;
    if (flagFilters.size > 0) {
      list = list.filter((r) => [...flagFilters].every((k) => FLAG_MATCHERS[k]?.(r)));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(q) || r.room.toLowerCase().includes(q));
    }
    return list;
  }, [baseList, flagFilters, search]); // eslint-disable-line react-hooks/exhaustive-deps

  const favCount = residents.filter((r) => r.isFavorited).length;

  const handleStar = (e: React.MouseEvent, resident: Resident) => {
    e.stopPropagation();
    toggleFav.mutate(
      { residentId: resident.id, data: { isFavorited: !resident.isFavorited } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListResidentsQueryKey() }) },
    );
  };

  const STABILITY_CYCLE: Record<string, "stable" | "watch" | "unstable"> = {
    stable: "watch",
    watch: "unstable",
    unstable: "stable",
  };

  const handleDotClick = (e: React.MouseEvent, resident: Resident) => {
    e.stopPropagation();
    const next = STABILITY_CYCLE[resident.stabilityStatus] ?? "watch";
    queryClient.setQueryData(
      getListResidentsQueryKey(),
      (old: Resident[] | undefined) =>
        old?.map((r) => r.id === resident.id ? { ...r, stabilityStatus: next } : r),
    );
    updateStability.mutate(
      { residentId: resident.id, data: { status: next } },
      {
        onError: () => {
          queryClient.invalidateQueries({ queryKey: getListResidentsQueryKey() });
          toast({ title: "Update failed", description: "Could not save stability status.", variant: "destructive" });
        },
      },
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-30 bg-card border-b border-border px-6 py-3 flex items-center justify-between shadow-md shrink-0">
        <div>
          <p className="font-bold text-lg text-foreground leading-none">Frontline Staff — Event Hub</p>
          <p className="text-xs text-muted-foreground mt-0.5">Select a resident to log an event</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="bg-primary/10 text-primary border border-primary/20 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest">Frontline Staff</span>
          <div className="flex items-center gap-1.5 font-mono text-base tabular-nums text-foreground">
            <Clock className="w-4 h-4 text-muted-foreground" />
            {time.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
        </div>
      </header>

      {showBinder && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card sticky top-0 z-10">
            <button onClick={() => setShowBinder(false)}
              className="flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back to Residents
            </button>
          </div>
          <FrontlineCommBinder />
        </div>
      )}

      {showCommHub && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card sticky top-0 z-10">
            <button onClick={() => setShowCommHub(false)}
              className="flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back to Residents
            </button>
          </div>
          <CommHubView />
        </div>
      )}

      {showNotesQueue && (
        <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
          <NotesQueueView onClose={() => setShowNotesQueue(false)} />
        </div>
      )}

      <div className="sticky top-[61px] z-20 bg-background border-b border-border px-6 py-3 space-y-3 shrink-0">
        <div className="flex gap-2">
          <button onClick={() => { setFilter("all"); setShowBinder(false); setShowCommHub(false); setShowNotesQueue(false); }}
            className={["flex-1 py-3 rounded-xl font-bold text-sm uppercase tracking-wider border-2 transition-all",
              !showBinder && !showCommHub && !showNotesQueue && filter === "all" ? "bg-primary border-primary text-primary-foreground shadow-md" : "bg-card border-border text-muted-foreground hover:border-primary/40"].join(" ")}>
            All Residents ({residents.length})
          </button>
          <button onClick={() => { setFilter("favorites"); setShowBinder(false); setShowCommHub(false); setShowNotesQueue(false); }}
            className={["flex-1 py-3 rounded-xl font-bold text-sm uppercase tracking-wider border-2 transition-all flex items-center justify-center gap-2",
              !showBinder && !showCommHub && !showNotesQueue && filter === "favorites" ? "bg-amber-500 border-amber-500 text-white shadow-md" : "bg-card border-border text-muted-foreground hover:border-amber-500/40"].join(" ")}>
            <Star className={[!showBinder && !showCommHub && !showNotesQueue && filter === "favorites" ? "fill-white" : "", "w-4 h-4"].join(" ")} />
            My Patients ({favCount})
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowBinder(true); setShowCommHub(false); setShowNotesQueue(false); }}
            className={["flex-1 py-3 rounded-xl font-bold text-sm uppercase tracking-wider border-2 transition-all flex items-center justify-center gap-2",
              showBinder ? "bg-sky-600 border-sky-500 text-white shadow-md" : "bg-card border-border text-muted-foreground hover:border-sky-500/40"].join(" ")}>
            <MessageCircle className="w-4 h-4" />
            Family Binder
          </button>
          <button onClick={() => { setShowBinder(false); setShowCommHub(true); setShowNotesQueue(false); }}
            className={["flex-1 py-3 rounded-xl font-bold text-sm uppercase tracking-wider border-2 transition-all flex items-center justify-center gap-2",
              showCommHub ? "bg-violet-600 border-violet-500 text-white shadow-md" : "bg-card border-border text-muted-foreground hover:border-violet-500/40"].join(" ")}>
            <Send className="w-4 h-4" />
            Comm Hub
          </button>
          <button onClick={() => { setShowBinder(false); setShowCommHub(false); setShowNotesQueue(true); }}
            className={["flex-1 py-3 rounded-xl font-bold text-sm uppercase tracking-wider border-2 transition-all flex items-center justify-center gap-2",
              showNotesQueue ? "bg-emerald-700 border-emerald-500 text-white shadow-md" : "bg-card border-border text-muted-foreground hover:border-emerald-500/40"].join(" ")}>
            <FileText className="w-4 h-4" />
            Notes Queue{notesQueue.length > 0 ? ` (${notesQueue.length})` : ""}
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input type="text" placeholder="Search by name or room number..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-card border border-border rounded-xl pl-12 pr-10 py-3.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-base" />
          {search && <button onClick={() => setSearch("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>}
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { key: "unstable", label: "Unstable",      activeBg: "bg-red-600",    activeBorder: "border-red-500",    activeText: "text-white",        dot: "bg-red-400" },
              { key: "watch",    label: "Watch",         activeBg: "bg-amber-500",  activeBorder: "border-amber-400",  activeText: "text-white",        dot: "bg-amber-300" },
              { key: "infection",label: "Infection",     activeBg: "bg-orange-600", activeBorder: "border-orange-500", activeText: "text-white",        dot: null },
              { key: "fall",     label: "Recent Fall",   activeBg: "bg-rose-700",   activeBorder: "border-rose-500",   activeText: "text-white",        dot: null },
              { key: "med",      label: "Med Change",    activeBg: "bg-violet-700", activeBorder: "border-violet-500", activeText: "text-white",        dot: null },
            ] as const
          ).map(({ key, label, activeBg, activeBorder, activeText, dot }) => {
            const active = flagFilters.has(key);
            const cnt = chipCounts[key] ?? 0;
            return (
              <button
                key={key}
                onClick={() => {
                  setFlagFilters((prev) => {
                    const next = new Set(prev);
                    if (next.has(key)) next.delete(key); else next.add(key);
                    return next;
                  });
                }}
                className={[
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-all",
                  active
                    ? `${activeBg} ${activeBorder} ${activeText} shadow-sm`
                    : "bg-card border-border text-muted-foreground hover:border-muted-foreground/60",
                ].join(" ")}
              >
                {dot && <span className={["w-2 h-2 rounded-full shrink-0", dot].join(" ")} />}
                {label}
                <span className={["px-1.5 py-0.5 rounded-full text-[10px] font-bold", active ? "bg-white/20" : "bg-muted"].join(" ")}>
                  {cnt}
                </span>
              </button>
            );
          })}
          {flagFilters.size > 0 && (
            <button
              onClick={() => setFlagFilters(new Set())}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border-2 border-dashed border-muted-foreground/40 text-muted-foreground hover:border-muted-foreground transition-all"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          )}
          <button
            onClick={toggleLegend}
            title={showLegend ? "Hide legend" : "Show icon legend"}
            className={[
              "ml-auto flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-all",
              showLegend
                ? "bg-primary/10 border-primary/40 text-primary"
                : "bg-card border-border text-muted-foreground hover:border-muted-foreground/60",
            ].join(" ")}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            Legend
            <ChevronDown className={["w-3 h-3 transition-transform", showLegend ? "rotate-180" : ""].join(" ")} />
          </button>
        </div>

        {showLegend && (
          <div className="rounded-xl border border-border bg-card/60 px-4 py-3 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Icon Legend</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-orange-400 shrink-0" />
                <span className="text-xs text-foreground/80">Active infection flag</span>
              </div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span className="text-xs text-foreground/80">Fall(s) in past 60 days</span>
              </div>
              <div className="flex items-center gap-2">
                <Pill className="w-4 h-4 text-violet-400 shrink-0" />
                <span className="text-xs text-foreground/80">Medication change(s) in past 60 days</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1 shrink-0">
                  <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 ring-2 ring-emerald-400/40 inline-block" />
                  <span className="w-3.5 h-3.5 rounded-full bg-amber-400 ring-2 ring-amber-400/50 inline-block" />
                  <span className="w-3.5 h-3.5 rounded-full bg-red-500 ring-2 ring-red-400/50 inline-block" />
                </span>
                <span className="text-xs text-foreground/80">Stability: green / watch / unstable — tap to cycle</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && <div className="p-12 text-center text-muted-foreground">Loading residents...</div>}
        {!isLoading && filtered.length === 0 && (
          <div className="p-12 text-center space-y-2">
            <p className="text-muted-foreground font-medium">{filter === "favorites" ? "No patients starred yet." : "No residents match your search."}</p>
            {filter === "favorites" && <p className="text-muted-foreground/60 text-sm">Tap the star next to a resident to add them to My Patients.</p>}
          </div>
        )}
        <ul>
          {filtered.map((resident) => {
            const stability = resident.stabilityStatus ?? "stable";
            const dotCfg = stability === "unstable"
              ? { bg: "bg-red-500", ring: "ring-2 ring-red-400/50", label: "Unstable — click to change" }
              : stability === "watch"
              ? { bg: "bg-amber-400", ring: "ring-2 ring-amber-400/50", label: "Watch / Deteriorating — click to change" }
              : { bg: "bg-emerald-500", ring: "ring-2 ring-emerald-400/40", label: "Stable — click to change" };
            return (
              <li key={resident.id} className="flex items-center gap-3 px-4 border-b border-border/40 last:border-0">
                <button onClick={(e) => handleStar(e, resident)}
                  className="flex items-center justify-center w-11 h-11 rounded-full shrink-0 hover:bg-amber-500/10 active:bg-amber-500/20 transition-colors">
                  <Star className={["w-6 h-6 transition-colors", resident.isFavorited ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"].join(" ")} />
                </button>
                <span className="font-mono font-bold text-sm bg-muted/60 border border-border px-2.5 py-1 rounded-lg text-muted-foreground shrink-0 w-14 text-center">
                  {resident.room}
                </span>
                <div className="flex-1 min-w-0 py-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="font-semibold text-foreground text-base truncate">{resident.name}</p>
                    {(resident.infectionFlags?.length ?? 0) > 0 && (
                      <span title={`Infection: ${resident.infectionFlags?.join(", ")}`}>
                        <ShieldAlert className="w-4 h-4 text-orange-400 shrink-0" />
                      </span>
                    )}
                    {(resident.recentFallCount ?? 0) > 0 && (
                      <span title={`${resident.recentFallCount} fall${resident.recentFallCount === 1 ? "" : "s"} in past 60 days`}>
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                      </span>
                    )}
                    {(resident.recentMedChangeCount ?? 0) > 0 && (
                      <span title={`${resident.recentMedChangeCount} med change${resident.recentMedChangeCount === 1 ? "" : "s"} in past 60 days`}>
                        <Pill className="w-4 h-4 text-violet-400 shrink-0" />
                      </span>
                    )}
                  </div>
                  <div className="mt-1"><GutBadge level={alertMap[resident.id] ?? "unknown"} /></div>
                </div>
                <button
                  onClick={(e) => handleDotClick(e, resident)}
                  title={dotCfg.label}
                  className={["w-4 h-4 rounded-full shrink-0 transition-all cursor-pointer hover:scale-125 active:scale-110", dotCfg.bg, dotCfg.ring].join(" ")}
                />
                <button onClick={() => onSelect(resident)}
                  className="shrink-0 flex items-center gap-1.5 bg-primary hover:bg-primary/80 active:scale-95 text-primary-foreground font-bold text-sm px-4 py-3 rounded-xl transition-all shadow-md shadow-primary/20">
                  Chart <ChevronRight className="w-4 h-4" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// ── ── ── Notes Queue View ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──

function NotesQueueView({ onClose }: { onClose: () => void }) {
  const { notesQueue, removeNote, editNote } = useNotesQueue();
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());
  const prevLength = useRef(0);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = "@keyframes slideInNote { from { opacity:0; transform:translateY(-14px); } to { opacity:1; transform:translateY(0); } }";
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  useEffect(() => {
    if (notesQueue.length > prevLength.current && notesQueue[0]) {
      const id = notesQueue[0].id;
      setAnimatingIds((prev) => new Set([...prev, id]));
      setTimeout(() => setAnimatingIds((prev) => { const n = new Set(prev); n.delete(id); return n; }), 500);
    }
    prevLength.current = notesQueue.length;
  }, [notesQueue]);

  const handleCopy = async (content: string) => {
    try { await navigator.clipboard.writeText(content); toast({ title: "Copied to clipboard" }); }
    catch { toast({ title: "Copy failed", variant: "destructive" }); }
  };

  const startEdit = (id: string, content: string) => { setEditingId(id); setEditText(content); setDeletingId(null); };
  const saveEdit = (id: string) => { if (editText.trim()) editNote(id, editText.trim()); setEditingId(null); };
  const handleDelete = (id: string) => {
    if (deletingId === id) { removeNote(id); setDeletingId(null); toast({ title: "Note removed from queue" }); }
    else { setDeletingId(id); }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-30 bg-card border-b border-border px-6 py-4 shadow-md shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onClose}
            className="flex items-center gap-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors shrink-0">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="flex-1 flex items-center gap-3">
            <span className="font-bold text-base text-foreground">📋 Notes Queue</span>
            <span className="text-xs text-muted-foreground">Drafts for Review</span>
          </div>
          {notesQueue.length > 0 && (
            <span className="bg-primary/15 border border-primary/30 text-primary px-2.5 py-0.5 rounded-full text-xs font-bold shrink-0">
              {notesQueue.length} {notesQueue.length === 1 ? "draft" : "drafts"}
            </span>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {notesQueue.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center px-6">
            <div className="bg-muted/40 p-6 rounded-full">
              <FileText className="w-10 h-10 text-muted-foreground/30" />
            </div>
            <p className="font-semibold text-muted-foreground text-lg">Queue is empty</p>
            <p className="text-muted-foreground/60 text-sm max-w-xs leading-relaxed">
              Notes are added automatically when you save a clinical event — bowel, pain, behavior, intake, falls, or vitals.
            </p>
          </div>
        ) : (
          <ul className="max-w-3xl mx-auto w-full p-6 space-y-4">
            {notesQueue.map((note) => (
              <li
                key={note.id}
                className="rounded-2xl border border-border bg-card overflow-hidden"
                style={animatingIds.has(note.id) ? { animation: "slideInNote 0.4s ease-out" } : undefined}
              >
                {/* Card header */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/50 bg-muted/20">
                  <div>
                    <p className="font-bold text-foreground text-sm">{note.patientName}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">Room {note.roomNumber}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground/60 font-mono shrink-0">
                    {note.timestamp.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" })}
                    {" · "}
                    {note.timestamp.toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
                  </p>
                </div>

                {/* Card body */}
                <div className="px-5 py-4">
                  {editingId === note.id ? (
                    <div className="space-y-3">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={6}
                        autoFocus
                        className="w-full bg-background border-2 border-primary/40 rounded-xl px-4 py-3 text-sm font-mono text-foreground focus:outline-none focus:border-primary resize-none leading-relaxed"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => saveEdit(note.id)}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary/20 border border-primary/40 text-primary font-bold text-sm hover:bg-primary/30 transition-colors">
                          <Check className="w-3.5 h-3.5" /> Save
                        </button>
                        <button onClick={() => setEditingId(null)}
                          className="px-4 py-2 rounded-lg border border-border text-muted-foreground font-semibold text-sm hover:bg-muted transition-colors">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="font-mono text-sm text-foreground/85 leading-relaxed whitespace-pre-wrap">{note.content}</p>
                  )}
                </div>

                {/* Action buttons */}
                {editingId !== note.id && (
                  <div className="flex items-center gap-2 px-5 pb-4 flex-wrap">
                    <button onClick={() => startEdit(note.id, note.content)}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted font-semibold text-sm transition-colors">
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button onClick={() => handleCopy(note.content)}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted font-semibold text-sm transition-colors">
                      <Clipboard className="w-3.5 h-3.5" /> Copy
                    </button>
                    <div className="flex items-center gap-1.5 ml-auto">
                      {deletingId === note.id && (
                        <button onClick={() => setDeletingId(null)}
                          className="px-3.5 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted text-sm font-semibold transition-colors">
                          Cancel
                        </button>
                      )}
                      <button onClick={() => handleDelete(note.id)}
                        className={["flex items-center gap-1.5 px-3.5 py-2 rounded-lg border font-semibold text-sm transition-all",
                          deletingId === note.id
                            ? "bg-red-600 border-red-500 text-white shadow-lg"
                            : "border-border bg-card text-muted-foreground hover:text-red-400 hover:border-red-500/40"].join(" ")}>
                        <Trash2 className="w-3.5 h-3.5" />
                        {deletingId === note.id ? "Confirm Delete" : "Delete"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── ── ── Screen 2: Module Hub ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──

const MODULES: {
  key: ViewState; label: string; sub: string;
  icon: React.ElementType; bg: string; border: string; iconColor: string;
}[] = [
  { key: "bowel",    label: "Bowel",    sub: "Bristol + Amount",   icon: Droplets,     bg: "bg-amber-950/60",  border: "border-amber-700/50",  iconColor: "text-amber-400" },
  { key: "pain",     label: "Pain",     sub: "Severity + Location", icon: Zap,          bg: "bg-red-950/60",    border: "border-red-700/50",    iconColor: "text-red-400" },
  { key: "behavior", label: "Behavior", sub: "BPSD + Intensity",   icon: Brain,        bg: "bg-purple-950/60", border: "border-purple-700/50", iconColor: "text-purple-400" },
  { key: "intake",   label: "Intake",   sub: "Meal % + Fluids",    icon: Utensils,     bg: "bg-emerald-950/60",border: "border-emerald-700/50",iconColor: "text-emerald-400" },
  { key: "falls",    label: "Falls",    sub: "EMERGENCY",          icon: AlertOctagon, bg: "bg-red-900/80",    border: "border-red-500/70",    iconColor: "text-red-300" },
  { key: "vitals",   label: "Vitals",   sub: "BP · HR · Temp · O₂",icon: Activity,     bg: "bg-blue-950/60",   border: "border-blue-700/50",   iconColor: "text-blue-400" },
  { key: "message",  label: "Message MD",sub: "Send to Binder",   icon: Megaphone,    bg: "bg-sky-950/60",    border: "border-sky-700/50",    iconColor: "text-sky-400" },
];

function ModuleHub({ resident, onSelectModule, onBack }: {
  resident: Resident; onSelectModule: (m: ViewState) => void; onBack: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [staffName, setStaffName] = useState("Frontline Staff");
  const [showProgressNote, setShowProgressNote] = useState(false);
  const [progressNote, setProgressNote] = useState("");
  const [dictateState, setDictateState] = useState<"idle" | "recording" | "transcribing">("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const createBinder = useCreateBinderEntry();

  const { data: allTapers = [] } = useListMedicationTrackers(
    { residentId: resident.id },
    { query: { queryKey: getListMedicationTrackersQueryKey({ residentId: resident.id }) } },
  );

  const confirmTaper = useConfirmTaperStarted();

  const activeTapers = allTapers.filter((t) => t.status === "Ordered" || t.status === "Active Taper");
  const hasPending = activeTapers.some((t) => t.status === "Ordered");

  const handleConfirm = (trackerId: number, medicationName: string) => {
    if (!staffName.trim()) {
      toast({ title: "Enter your name before confirming.", variant: "destructive" });
      return;
    }
    confirmTaper.mutate(
      { trackerId, data: { confirmedBy: staffName.trim() } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMedicationTrackersQueryKey({ residentId: resident.id }) });
          queryClient.invalidateQueries({ queryKey: getGetPhysicianSummaryQueryKey() });
          toast({ title: "Taper Confirmed", description: `${medicationName} — taper started. 90-day review scheduled.` });
        },
        onError: () => toast({ title: "Confirmation failed", variant: "destructive" }),
      },
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 bg-card border-b border-border px-4 py-3 flex items-center gap-4 shadow-md">
        <button onClick={onBack} className="flex items-center justify-center w-11 h-11 rounded-full hover:bg-muted transition-colors shrink-0">
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-base text-foreground leading-none truncate">{resident.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Room {resident.room} — Select a care module</p>
        </div>
        <button
          onClick={() => setShowProgressNote(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors text-xs font-bold shrink-0"
        >
          <BookOpen className="w-3.5 h-3.5" />
          Progress Note
        </button>
        <span className="bg-primary/10 text-primary border border-primary/20 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest shrink-0">Frontline Staff</span>
      </header>

      {/* Progress Note Sidebar */}
      {showProgressNote && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setShowProgressNote(false)} />
          <div className="fixed inset-y-0 right-0 w-full max-w-sm z-50 bg-card border-l border-border shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <p className="font-bold text-sm text-foreground">Progress Note — {resident.name}</p>
              <button onClick={() => setShowProgressNote(false)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="flex items-center gap-3 bg-muted/30 rounded-xl p-3">
                <img src={`https://i.pravatar.cc/60?img=${((resident.id - 6) % 70) + 1}`} className="w-12 h-12 rounded-full shrink-0 ring-2 ring-border" alt="" />
                <div>
                  <p className="font-bold text-foreground">{resident.name}</p>
                  <p className="text-xs text-muted-foreground">Room {resident.room}</p>
                </div>
              </div>
              {(() => {
                const falls = getMockFalls(resident.id);
                const prnLax = getMockPRNLaxCount(resident.id);
                const prnAP = getMockPRNAntipsychoticCount(resident.id);
                return (
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Clinical Overview</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className={["rounded-xl border px-3 py-2", falls.length > 0 ? "bg-red-950/40 border-red-500/40" : "bg-background/50 border-border"].join(" ")}>
                        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70">Falls (1yr)</p>
                        <p className={["text-sm font-bold", falls.length > 0 ? "text-red-400" : "text-emerald-400"].join(" ")}>
                          {falls.length > 0 ? `${falls.length} event${falls.length !== 1 ? "s" : ""}` : "None"}
                        </p>
                      </div>
                      <div className={["rounded-xl border px-3 py-2", prnLax > 2 ? "bg-orange-950/40 border-orange-500/40" : "bg-background/50 border-border"].join(" ")}>
                        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70">PRN Lax (14d)</p>
                        <p className={["text-sm font-bold", prnLax > 0 ? "text-orange-400" : "text-emerald-400"].join(" ")}>
                          {prnLax > 0 ? `${prnLax} dose${prnLax !== 1 ? "s" : ""}` : "None"}
                        </p>
                      </div>
                      <div className={["rounded-xl border px-3 py-2 col-span-2", prnAP > 0 ? "bg-purple-950/40 border-purple-500/40" : "bg-background/50 border-border"].join(" ")}>
                        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70">PRN Antipsych (14d)</p>
                        <p className={["text-sm font-bold", prnAP > 0 ? "text-purple-400" : "text-emerald-400"].join(" ")}>
                          {prnAP > 0 ? `${prnAP} dose${prnAP !== 1 ? "s" : ""}` : "None"}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}
              {activeTapers.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Active Tapers</p>
                  {activeTapers.map((taper) => (
                    <div key={taper.id} className={["rounded-xl border px-3 py-2", taper.status === "Active Taper" ? "bg-green-950/30 border-green-700/40" : "bg-indigo-950/30 border-indigo-700/40"].join(" ")}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-foreground">{taper.medicationName}</p>
                        <span className={["text-[10px] font-bold px-1.5 py-0.5 rounded-full", taper.status === "Active Taper" ? "bg-green-900/60 text-green-300" : "bg-indigo-900/60 text-indigo-300"].join(" ")}>
                          {taper.status === "Active Taper" ? "Active" : "Ordered"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">SBAR Progress Note</p>
                  <button
                    type="button"
                    disabled={dictateState === "transcribing"}
                    onClick={async () => {
                      if (dictateState === "recording") {
                        mediaRecorderRef.current?.stop();
                        return;
                      }
                      try {
                        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        audioChunksRef.current = [];
                        const mr = new MediaRecorder(stream);
                        mediaRecorderRef.current = mr;
                        mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
                        mr.onstop = async () => {
                          stream.getTracks().forEach((t) => t.stop());
                          setDictateState("transcribing");
                          await new Promise((r) => setTimeout(r, 1200));
                          const template = [
                            `S: ${resident.name} — [describe the current situation and chief complaint]`,
                            `B: [relevant background — known diagnoses, recent events, current medications]`,
                            `A: [your clinical assessment of what is happening]`,
                            `R: [recommended actions — escalation, monitoring, interventions]`,
                          ].join("\n\n");
                          setProgressNote((prev) => prev ? `${prev}\n\n${template}` : template);
                          toast({ title: "Template inserted", description: "Replace bracketed prompts with your dictated content." });
                          setDictateState("idle");
                        };
                        mr.start();
                        setDictateState("recording");
                      } catch {
                        toast({ title: "Microphone access denied", description: "Allow microphone permission to use dictation.", variant: "destructive" });
                      }
                    }}
                    className={[
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                      dictateState === "recording"
                        ? "border-red-500/60 bg-red-500/15 text-red-400 animate-pulse"
                        : "border-border bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground",
                    ].join(" ")}
                  >
                    {dictateState === "transcribing" ? (
                      <><Loader2 className="w-3 h-3 animate-spin" />Transcribing…</>
                    ) : dictateState === "recording" ? (
                      <><Mic className="w-3 h-3" />Stop Recording</>
                    ) : (
                      <><Mic className="w-3 h-3" />Dictate</>
                    )}
                  </button>
                </div>
                <textarea
                  value={progressNote}
                  onChange={(e) => setProgressNote(e.target.value)}
                  rows={7}
                  placeholder={"S: Situation — what is happening now\nB: Background — relevant history\nA: Assessment — clinical judgment\nR: Recommendation — next steps"}
                  className="w-full bg-background border border-border rounded-xl p-3 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary resize-none leading-relaxed font-mono"
                />
              </div>
            </div>
            <div className="px-4 py-3 border-t border-border shrink-0">
              <button
                onClick={async () => {
                  if (!progressNote.trim()) return;
                  try { await navigator.clipboard.writeText(progressNote); } catch { /* blocked */ }
                  createBinder.mutate({ data: { residentId: resident.id, messageText: `[Progress Note] ${progressNote}` } }, {
                    onSuccess: () => {
                      queryClient.invalidateQueries({ queryKey: getListBinderEntriesQueryKey() });
                      toast({ title: "Note Saved", description: "SBAR note copied to clipboard and sent to binder." });
                      setProgressNote("");
                    },
                    onError: () => toast({ title: "Save failed", variant: "destructive" }),
                  });
                }}
                disabled={!progressNote.trim() || createBinder.isPending}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <BookOpen className="w-4 h-4" />
                Save Note &amp; Copy to Clipboard
              </button>
            </div>
          </div>
        </>
      )}

      <main className="max-w-3xl mx-auto p-6">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-5">What would you like to log?</p>
        <div className="grid grid-cols-2 gap-4">
          {MODULES.map((mod) => {
            const Icon = mod.icon;
            return (
              <button key={mod.key} onClick={() => onSelectModule(mod.key)}
                className={["flex flex-col items-center justify-center gap-3 p-6 min-h-[140px] rounded-2xl border-2 transition-all active:scale-95 hover:brightness-110", mod.bg, mod.border].join(" ")}>
                <Icon className={["w-10 h-10", mod.iconColor].join(" ")} />
                <div className="text-center">
                  <p className="font-bold text-foreground text-lg leading-tight">{mod.label}</p>
                  <p className="text-muted-foreground text-xs mt-0.5">{mod.sub}</p>
                </div>
              </button>
            );
          })}
        </div>

        {activeTapers.length > 0 && (
          <div className="mt-8 space-y-4">
            <div className="flex items-center gap-3">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Active Tapers</p>
              <span className="bg-indigo-950/60 border border-indigo-700/50 text-indigo-300 px-2.5 py-0.5 rounded-full text-xs font-bold">{activeTapers.length}</span>
            </div>

            {hasPending && (
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  placeholder="Your name..."
                  className="flex-1 bg-card border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                />
                <p className="text-xs text-muted-foreground whitespace-nowrap">Staff name for log</p>
              </div>
            )}

            {activeTapers.map((taper) => (
              <div key={taper.id} className={["rounded-2xl border-2 p-5 space-y-3",
                taper.status === "Active Taper"
                  ? "bg-green-950/30 border-green-700/40"
                  : "bg-indigo-950/40 border-indigo-700/50"].join(" ")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-foreground text-base">💊 {taper.medicationName}</p>
                    {taper.dosageInstructions && (
                      <p className="text-muted-foreground text-sm mt-0.5">{taper.dosageInstructions}</p>
                    )}
                  </div>
                  {taper.status === "Active Taper" ? (
                    <span className="bg-green-900/60 border border-green-700/50 text-green-300 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap shrink-0">✓ Active</span>
                  ) : (
                    <span className="bg-amber-900/60 border border-amber-700/50 text-amber-300 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap shrink-0">Awaiting Start</span>
                  )}
                </div>

                {taper.status === "Active Taper" && taper.startDate && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Started: {new Date(taper.startDate).toLocaleDateString()}</span>
                    {taper.reviewDueDate && <span>Review due: {new Date(taper.reviewDueDate).toLocaleDateString()}</span>}
                    {taper.confirmedBy && <span>Confirmed by: {taper.confirmedBy}</span>}
                  </div>
                )}

                {taper.status === "Ordered" && (
                  <button
                    onClick={() => handleConfirm(taper.id, taper.medicationName)}
                    disabled={confirmTaper.isPending}
                    className="w-full min-h-[68px] rounded-xl font-bold text-lg bg-indigo-600 hover:bg-indigo-500 text-white border-2 border-indigo-400/50 shadow-lg shadow-indigo-900/30 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-3">
                    {confirmTaper.isPending ? "Confirming..." : "✅ Confirm Taper Started Today"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Full Patient Record — inline below tapers */}
        <div className="mt-8 rounded-2xl border border-border overflow-hidden">
          <PatientOverlay
            resident={{
              residentId: resident.id,
              name: resident.name,
              room: resident.room ?? null,
              dob: resident.dob ? String(resident.dob).slice(0, 10) : null,
            }}
            onClose={() => {}}
            inline
          />
        </div>
      </main>
    </div>
  );
}

// ── ── ── Screen 3a: Bowel Form ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──

function BowelForm({ resident, onBack }: { resident: Resident; onBack: () => void }) {
  const [stoolType, setStoolType] = useState<StoolType>(null);
  const [amount, setAmount] = useState<Amount>(null);
  const [flags, setFlags] = useState<BowelFlags>({ incontinence: false, blood: false, mucus: false, pain: false });
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateStr);
  const [selectedHour, setSelectedHour] = useState<number>(getCurrentHour);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createBM = useCreateBowelMovement();
  const { addNote } = useNotesQueue();

  const note = useMemo(() => {
    if (!stoolType && !amount && !Object.values(flags).some(Boolean)) return "Awaiting documentation input...";
    const situationParts: string[] = [];
    if (stoolType && amount) {
      const desc = STOOL_TYPES.find((t) => t.id === stoolType)?.desc.toLowerCase() ?? "";
      situationParts.push(`Type ${stoolType} BM (${desc}), ${amount} amount`);
    } else if (stoolType) {
      const desc = STOOL_TYPES.find((t) => t.id === stoolType)?.desc.toLowerCase() ?? "";
      situationParts.push(`Type ${stoolType} BM (${desc})`);
    } else if (amount) {
      situationParts.push(`${amount} BM`);
    }
    if (flags.incontinence) situationParts.push("incontinent episode");
    const flagList = [flags.blood && "blood present", flags.mucus && "mucus noted", flags.pain && "pain/straining"].filter(Boolean).join(", ");
    if (flagList) situationParts.push(flagList);
    const assessment = flags.blood
      ? "Blood present — clinically significant. Physician review required."
      : (stoolType && stoolType <= 2) ? "Hard stool. Laxative protocol review indicated."
      : (stoolType && stoolType >= 6) ? "Loose/liquid stool. Monitor hydration."
      : "Stool characteristics within expected range.";
    const recommendation = flags.blood
      ? "Notify physician immediately. Monitor for recurrence."
      : "Continue bowel monitoring per care plan.";
    return `S: ${situationParts.join("; ") || "Bowel event documented"}.\nB: ${resident.name}, Room ${resident.room}.\nA: ${assessment}\nR: ${recommendation}`;
  }, [stoolType, amount, flags, resident]);

  const hasData = stoolType !== null || amount !== null || Object.values(flags).some(Boolean);

  const handleReset = () => {
    setStoolType(null); setAmount(null);
    setFlags({ incontinence: false, blood: false, mucus: false, pain: false });
    setSelectedDate(getTodayDateStr()); setSelectedHour(getCurrentHour());
  };

  const handleSave = () => {
    if (!stoolType || !amount) { toast({ title: "Incomplete entry", description: "Select stool type and amount.", variant: "destructive" }); return; }
    createBM.mutate({ data: { residentId: resident.id, bristolType: stoolType, amount, incontinence: flags.incontinence, bloodPresent: flags.blood, mucusPresent: flags.mucus, painStraining: flags.pain, clinicalNote: note, recordedAt: buildRecordedAt(selectedDate, selectedHour) } }, {
      onSuccess: async () => {
        try { await navigator.clipboard.writeText(note); } catch { /* blocked */ }
        queryClient.invalidateQueries({ queryKey: getGetPhysicianSummaryQueryKey() });
        addNote({ patientName: resident.name, roomNumber: resident.room, content: note });
        toast({ title: "Saved & copied", description: "BM recorded. Note copied to clipboard." });
        handleReset(); onBack();
      },
      onError: () => toast({ title: "Save failed", description: "Could not save. Try again.", variant: "destructive" }),
    });
  };

  return (
    <FormShell resident={resident} title="Bowel Movement Log" onBack={onBack}
      onReset={handleReset} onSave={handleSave} hasData={hasData} isSaving={createBM.isPending}>
      {/* Date & Time */}
      <section className="space-y-3">
        <SectionLabel>Date &amp; Time of Bowel Movement</SectionLabel>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-center text-muted-foreground uppercase tracking-wider">Date</p>
            <ScrollPicker items={DATE_ITEMS} value={selectedDate} onChange={(v) => setSelectedDate(v as string)} />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-center text-muted-foreground uppercase tracking-wider">Time</p>
            <ScrollPicker items={HOUR_ITEMS} value={selectedHour} onChange={(v) => setSelectedHour(v as number)} />
          </div>
        </div>
      </section>

      {/* Bristol Stool Scale */}
      <section className="space-y-3">
        <SectionLabel>Stool Type (Bristol Scale)</SectionLabel>
        <div className="grid grid-cols-7 gap-2">
          {STOOL_TYPES.map((type) => {
            const sel = stoolType === type.id;
            return (
              <button key={type.id} onClick={() => setStoolType(sel ? null : (type.id as StoolType))}
                className={["flex flex-col items-center justify-center p-2 min-h-[130px] rounded-xl border-4 transition-all duration-150",
                  sel ? "border-primary scale-[1.04] shadow-xl shadow-primary/25 bg-card/90" : "border-transparent bg-card hover:border-primary/40"].join(" ")}>
                <div className={["w-12 h-12 rounded-full flex items-center justify-center mb-2 text-lg font-bold", type.color, type.text].join(" ")}>{type.id}</div>
                <span className="text-center text-xs font-medium leading-tight text-foreground">{type.desc}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Amount */}
      <section className="space-y-3">
        <SectionLabel>Amount</SectionLabel>
        <div className="grid grid-cols-4 gap-3">
          {(["Small", "Medium", "Large", "XL"] as const).map((amt) => (
            <button key={amt} onClick={() => setAmount(amount === amt ? null : amt)}
              className={["min-h-[80px] rounded-xl font-bold text-xl border-2 transition-all duration-150",
                amount === amt ? "bg-primary border-primary text-primary-foreground shadow-lg shadow-primary/25" : "bg-card border-border text-foreground hover:border-primary/50"].join(" ")}>
              {amt}
            </button>
          ))}
        </div>
      </section>

      {/* Flags */}
      <section className="space-y-3">
        <SectionLabel>Clinical Flags</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          {([
            { key: "incontinence" as const, label: "Incontinence",    on: "bg-amber-500 border-amber-500 text-white", off: "hover:border-amber-500/50" },
            { key: "blood"        as const, label: "Blood Present",   on: "bg-red-600 border-red-600 text-white",   off: "hover:border-red-600/50" },
            { key: "mucus"        as const, label: "Mucus Present",   on: "bg-yellow-500 border-yellow-500 text-white", off: "hover:border-yellow-500/50" },
            { key: "pain"         as const, label: "Pain / Straining",on: "bg-purple-500 border-purple-500 text-white", off: "hover:border-purple-500/50" },
          ] as const).map((flag) => (
            <button key={flag.key} onClick={() => setFlags((f) => ({ ...f, [flag.key]: !f[flag.key] }))}
              className={["min-h-[80px] rounded-xl font-bold text-xl border-2 transition-all shadow-lg",
                flags[flag.key] ? flag.on : "bg-card border-border text-foreground " + flag.off].join(" ")}>
              {flag.label}
            </button>
          ))}
        </div>
      </section>

      {/* Clinical Note */}
      <section className="space-y-3">
        <SectionLabel>SBAR Note</SectionLabel>
        <div className="bg-card border-2 border-border rounded-xl p-5 min-h-[90px] flex items-start shadow-inner">
          <p className="font-mono text-base text-foreground leading-relaxed w-full whitespace-pre-wrap">{note}</p>
        </div>
      </section>
    </FormShell>
  );
}

// ── ── ── Screen 3b: Pain Form ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──

function PainForm({ resident, onBack }: { resident: Resident; onBack: () => void }) {
  const [severity, setSeverity] = useState<PainEventInputSeverity | null>(null);
  const [location, setLocation] = useState<PainEventInputLocation | null>(null);
  const [prnGiven, setPrnGiven] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateStr);
  const [selectedHour, setSelectedHour] = useState<number>(getCurrentHour);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createPain = useCreatePainEvent();
  const { addNote: addNotePain } = useNotesQueue();

  const note = useMemo(() => {
    if (!severity) return "Awaiting documentation input...";
    const loc = location ? ` at ${location}` : "";
    const assessment = severity === "Severe"
      ? "Severe pain — clinically significant. Prompt physician review required."
      : severity === "Moderate"
      ? "Moderate pain. Monitor closely for escalation."
      : "Pain within manageable range.";
    const recommendation = `PRN medication ${prnGiven ? "administered" : "not administered"}. ${severity === "Severe" ? "Notify physician and charge nurse." : "Reassess in 30–60 minutes."}`;
    return `S: ${severity} pain reported${loc}.\nB: ${resident.name}, Room ${resident.room}.\nA: ${assessment}\nR: ${recommendation}`;
  }, [severity, location, prnGiven, resident]);

  const hasData = !!severity;

  const handleReset = () => {
    setSeverity(null); setLocation(null); setPrnGiven(false);
    setSelectedDate(getTodayDateStr()); setSelectedHour(getCurrentHour());
  };

  const handleSave = () => {
    if (!severity || !location) { toast({ title: "Incomplete entry", description: "Select severity and location.", variant: "destructive" }); return; }
    createPain.mutate({ data: { residentId: resident.id, severity, location, prnGiven, clinicalNote: note, recordedAt: buildRecordedAt(selectedDate, selectedHour) } }, {
      onSuccess: async () => {
        try { await navigator.clipboard.writeText(note); } catch { /* blocked */ }
        queryClient.invalidateQueries({ queryKey: getGetPhysicianSummaryQueryKey() });
        addNotePain({ patientName: resident.name, roomNumber: resident.room, content: note });
        toast({ title: "Saved & copied", description: "Pain event recorded." });
        handleReset(); onBack();
      },
      onError: () => toast({ title: "Save failed", variant: "destructive" }),
    });
  };

  return (
    <FormShell resident={resident} title="Pain Assessment" onBack={onBack}
      onReset={handleReset} onSave={handleSave} hasData={hasData} isSaving={createPain.isPending}>
      <section className="space-y-3">
        <SectionLabel>Date &amp; Time of Observation</SectionLabel>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-center text-muted-foreground uppercase tracking-wider">Date</p>
            <ScrollPicker items={DATE_ITEMS} value={selectedDate} onChange={(v) => setSelectedDate(v as string)} />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-center text-muted-foreground uppercase tracking-wider">Time</p>
            <ScrollPicker items={HOUR_ITEMS} value={selectedHour} onChange={(v) => setSelectedHour(v as number)} />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <SectionLabel>Pain Severity</SectionLabel>
        <div className="grid grid-cols-2 gap-4">
          {PAIN_SEVERITIES.map((s) => (
            <button key={s.value} onClick={() => setSeverity(severity === s.value ? null : s.value)}
              className={["min-h-[100px] rounded-2xl font-bold text-2xl border-4 transition-all duration-150",
                s.bg, s.text, severity === s.value ? "border-white scale-[1.03] shadow-xl" : `${s.border} opacity-70 hover:opacity-100`].join(" ")}>
              {s.label}
            </button>
          ))}
        </div>
      </section>

      {severity && severity !== "None" && (
        <section className="space-y-3">
          <SectionLabel>Pain Location</SectionLabel>
          <div className="grid grid-cols-3 gap-3">
            {PAIN_LOCATIONS.map((loc) => (
              <button key={loc} onClick={() => setLocation(location === loc ? null : loc)}
                className={["min-h-[72px] rounded-xl font-bold text-lg border-2 transition-all",
                  location === loc ? "bg-red-600/30 border-red-500 text-red-200" : "bg-card border-border text-foreground hover:border-red-500/50"].join(" ")}>
                {loc}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <SectionLabel>PRN Medication</SectionLabel>
        <button onClick={() => setPrnGiven((v) => !v)}
          className={["w-full min-h-[72px] rounded-xl font-bold text-xl border-2 transition-all",
            prnGiven ? "bg-emerald-600 border-emerald-500 text-white shadow-lg" : "bg-card border-border text-foreground hover:border-emerald-500/50"].join(" ")}>
          {prnGiven ? "PRN Given ✓" : "PRN Not Given"}
        </button>
      </section>

      <section className="space-y-3">
        <SectionLabel>SBAR Note</SectionLabel>
        <div className="bg-card border-2 border-border rounded-xl p-5 min-h-[72px] flex items-center shadow-inner">
          <p className="font-mono text-base text-foreground leading-relaxed w-full whitespace-pre-wrap">{note}</p>
        </div>
      </section>
    </FormShell>
  );
}

// ── ── ── Screen 3c: Behavior Form ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──

function BehaviorForm({ resident, onBack }: { resident: Resident; onBack: () => void }) {
  const [type, setType] = useState<BehaviorEventInputType | null>(null);
  const [intensity, setIntensity] = useState<"Low" | "High" | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateStr);
  const [selectedHour, setSelectedHour] = useState<number>(getCurrentHour);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createBehavior = useCreateBehaviorEvent();
  const { addNote: addNoteBehavior } = useNotesQueue();

  const note = useMemo(() => {
    if (!type) return "Awaiting documentation input...";
    const dur = duration ? ` Duration: ~${duration} min.` : "";
    const assessment = intensity === "High"
      ? "High-intensity BPSD episode. Risk of escalation."
      : "Low-intensity behavioral event. Monitor for pattern.";
    const recommendation = intensity === "High"
      ? "Notify charge nurse and physician. Implement de-escalation protocol."
      : "Document in behavior log. Monitor for frequency increase.";
    return `S: ${type} behavior — ${intensity ?? "unspecified"} intensity.${dur}\nB: ${resident.name}, Room ${resident.room}.\nA: ${assessment}\nR: ${recommendation}`;
  }, [type, intensity, duration, resident]);

  const hasData = !!type;
  const handleReset = () => {
    setType(null); setIntensity(null); setDuration(null);
    setSelectedDate(getTodayDateStr()); setSelectedHour(getCurrentHour());
  };

  const handleSave = () => {
    if (!type || !intensity) { toast({ title: "Incomplete entry", description: "Select behavior type and intensity.", variant: "destructive" }); return; }
    createBehavior.mutate({ data: { residentId: resident.id, type, intensity, durationMins: duration ?? undefined, clinicalNote: note, recordedAt: buildRecordedAt(selectedDate, selectedHour) } }, {
      onSuccess: async () => {
        try { await navigator.clipboard.writeText(note); } catch { /* blocked */ }
        queryClient.invalidateQueries({ queryKey: getGetPhysicianSummaryQueryKey() });
        addNoteBehavior({ patientName: resident.name, roomNumber: resident.room, content: note });
        toast({ title: "Saved & copied", description: "Behavior event recorded." });
        handleReset(); onBack();
      },
      onError: () => toast({ title: "Save failed", variant: "destructive" }),
    });
  };

  return (
    <FormShell resident={resident} title="Behavior Event" onBack={onBack}
      onReset={handleReset} onSave={handleSave} hasData={hasData} isSaving={createBehavior.isPending}>
      <section className="space-y-3">
        <SectionLabel>Date &amp; Time of Observation</SectionLabel>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-center text-muted-foreground uppercase tracking-wider">Date</p>
            <ScrollPicker items={DATE_ITEMS} value={selectedDate} onChange={(v) => setSelectedDate(v as string)} />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-center text-muted-foreground uppercase tracking-wider">Time</p>
            <ScrollPicker items={HOUR_ITEMS} value={selectedHour} onChange={(v) => setSelectedHour(v as number)} />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <SectionLabel>Behavior Type</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          {BEHAVIOR_TYPES.map((t) => (
            <button key={t} onClick={() => setType(type === t ? null : t)}
              className={["min-h-[80px] rounded-xl font-bold text-lg border-2 transition-all",
                type === t ? "bg-purple-700/50 border-purple-400 text-purple-100 shadow-lg" : "bg-card border-border text-foreground hover:border-purple-500/50"].join(" ")}>
              {t}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <SectionLabel>Intensity</SectionLabel>
        <div className="grid grid-cols-2 gap-4">
          {(["Low", "High"] as const).map((i) => (
            <button key={i} onClick={() => setIntensity(intensity === i ? null : i)}
              className={["min-h-[80px] rounded-xl font-bold text-2xl border-2 transition-all",
                intensity === i
                  ? i === "Low" ? "bg-yellow-600/40 border-yellow-400 text-yellow-200 shadow-lg" : "bg-red-700/50 border-red-400 text-red-200 shadow-lg"
                  : "bg-card border-border text-foreground hover:border-purple-500/50"].join(" ")}>
              {i}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <SectionLabel>Duration (optional)</SectionLabel>
        <div className="grid grid-cols-4 gap-3">
          {BEHAVIOR_DURATIONS.map((d) => (
            <button key={d} onClick={() => setDuration(duration === d ? null : d)}
              className={["min-h-[72px] rounded-xl font-bold text-lg border-2 transition-all",
                duration === d ? "bg-purple-700/40 border-purple-400 text-purple-100" : "bg-card border-border text-foreground hover:border-purple-500/50"].join(" ")}>
              {d} min
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <SectionLabel>SBAR Note</SectionLabel>
        <div className="bg-card border-2 border-border rounded-xl p-5 min-h-[72px] flex items-center shadow-inner">
          <p className="font-mono text-base text-foreground leading-relaxed w-full whitespace-pre-wrap">{note}</p>
        </div>
      </section>
    </FormShell>
  );
}

// ── ── ── Screen 3d: Intake Form ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──

const MEAL_TYPES = [
  { value: "Breakfast", color: "bg-amber-900/60 border-amber-600 text-amber-200", icon: "🌅" },
  { value: "Lunch",     color: "bg-yellow-900/60 border-yellow-600 text-yellow-200", icon: "☀️" },
  { value: "Dinner",    color: "bg-orange-900/60 border-orange-600 text-orange-200", icon: "🌙" },
  { value: "Snack",     color: "bg-teal-900/60 border-teal-500 text-teal-200", icon: "🍎" },
] as const;
type MealType = typeof MEAL_TYPES[number]["value"];

function IntakeForm({ resident, onBack }: { resident: Resident; onBack: () => void }) {
  const [mealType, setMealType] = useState<MealType | null>(null);
  const [mealPercent, setMealPercent] = useState<IntakeEventInputMealPercent | null>(null);
  const [fluidMl, setFluidMl] = useState(0);
  const [supplementsGiven, setSupplementsGiven] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateStr);
  const [selectedHour, setSelectedHour] = useState<number>(getCurrentHour);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createIntake = useCreateIntakeEvent();
  const { addNote: addNoteIntake } = useNotesQueue();

  const note = useMemo(() => {
    if (mealPercent === null && fluidMl === 0) return "Awaiting documentation input...";
    const mealStr = mealType ? `${mealType}: ` : "";
    const pctStr = mealPercent !== null ? `${mealPercent}% of meal consumed` : "meal % not recorded";
    const fluidStr = fluidMl > 0 ? `${fluidMl} mL fluid` : "fluid not recorded";
    const assessment = mealPercent !== null && mealPercent <= 25
      ? "Significantly reduced intake — nutritional risk. Dietitian referral may be indicated."
      : mealPercent !== null && mealPercent <= 50
      ? "Below-target intake. Monitor trend."
      : "Adequate intake documented.";
    const recommendation = `Supplements ${supplementsGiven ? "given" : "not given"}. ${mealPercent !== null && mealPercent <= 25 ? "Notify dietitian." : "Continue routine intake monitoring."}`;
    return `S: ${mealStr}${pctStr}; ${fluidStr}.\nB: ${resident.name}, Room ${resident.room}.\nA: ${assessment}\nR: ${recommendation}`;
  }, [mealType, mealPercent, fluidMl, supplementsGiven, resident]);

  const hasData = mealPercent !== null || fluidMl > 0 || mealType !== null;
  const handleReset = () => {
    setMealType(null); setMealPercent(null); setFluidMl(0); setSupplementsGiven(false);
    setSelectedDate(getTodayDateStr()); setSelectedHour(getCurrentHour());
  };

  const handleSave = () => {
    if (mealPercent === null) { toast({ title: "Incomplete entry", description: "Select a meal percentage.", variant: "destructive" }); return; }
    createIntake.mutate({ data: { residentId: resident.id, mealType: mealType ?? undefined, mealPercent, fluidMl, supplementsGiven, clinicalNote: note, recordedAt: buildRecordedAt(selectedDate, selectedHour) } }, {
      onSuccess: async () => {
        try { await navigator.clipboard.writeText(note); } catch { /* blocked */ }
        queryClient.invalidateQueries({ queryKey: getGetPhysicianSummaryQueryKey() });
        addNoteIntake({ patientName: resident.name, roomNumber: resident.room, content: note });
        toast({ title: "Saved & copied", description: "Intake event recorded." });
        handleReset(); onBack();
      },
      onError: () => toast({ title: "Save failed", variant: "destructive" }),
    });
  };

  const mealColor = (pct: number) => {
    if (pct === 0)   return "bg-red-900/60 border-red-600 text-red-200";
    if (pct <= 25)   return "bg-orange-900/60 border-orange-600 text-orange-200";
    if (pct <= 50)   return "bg-yellow-900/60 border-yellow-600 text-yellow-200";
    if (pct <= 75)   return "bg-lime-900/60 border-lime-500 text-lime-200";
    return "bg-emerald-900/60 border-emerald-500 text-emerald-200";
  };

  return (
    <FormShell resident={resident} title="Meal & Fluid Intake" onBack={onBack}
      onReset={handleReset} onSave={handleSave} hasData={hasData} isSaving={createIntake.isPending}>
      <section className="space-y-3">
        <SectionLabel>Date &amp; Time of Meal</SectionLabel>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-center text-muted-foreground uppercase tracking-wider">Date</p>
            <ScrollPicker items={DATE_ITEMS} value={selectedDate} onChange={(v) => setSelectedDate(v as string)} />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-center text-muted-foreground uppercase tracking-wider">Time</p>
            <ScrollPicker items={HOUR_ITEMS} value={selectedHour} onChange={(v) => setSelectedHour(v as number)} />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <SectionLabel>Meal Type (optional)</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          {MEAL_TYPES.map((mt) => (
            <button key={mt.value} onClick={() => setMealType(mealType === mt.value ? null : mt.value)}
              className={["min-h-[72px] rounded-xl font-bold text-xl border-2 transition-all flex flex-col items-center justify-center gap-1",
                mealType === mt.value ? [mt.color, "scale-[1.03] shadow-lg"].join(" ") : "bg-card border-border text-foreground hover:border-amber-500/50"].join(" ")}>
              <span>{mt.icon}</span>
              <span>{mt.value}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <SectionLabel>Meal Consumed</SectionLabel>
        <div className="grid grid-cols-5 gap-3">
          {([0, 25, 50, 75, 100] as IntakeEventInputMealPercent[]).map((pct) => (
            <button key={pct} onClick={() => setMealPercent(mealPercent === pct ? null : pct)}
              className={["min-h-[100px] rounded-xl font-bold text-2xl border-2 transition-all",
                mealPercent === pct ? mealColor(pct) + " scale-[1.04] shadow-xl" : "bg-card border-border text-foreground hover:border-emerald-500/50"].join(" ")}>
              {pct}%
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <SectionLabel>Fluid Intake — Total: {fluidMl} mL</SectionLabel>
        <div className="flex gap-3">
          <button onClick={() => setFluidMl((v) => Math.max(0, v - 250))} disabled={fluidMl < 250}
            className="flex-1 min-h-[80px] rounded-xl font-bold text-xl border-2 border-border bg-card text-foreground hover:border-blue-500/50 disabled:opacity-40 transition-all">
            − 250 mL
          </button>
          <button onClick={() => setFluidMl((v) => Math.max(0, v - 100))} disabled={fluidMl < 100}
            className="flex-1 min-h-[80px] rounded-xl font-bold text-xl border-2 border-border bg-card text-foreground hover:border-blue-500/50 disabled:opacity-40 transition-all">
            − 100 mL
          </button>
          <button onClick={() => setFluidMl((v) => v + 100)}
            className="flex-1 min-h-[80px] rounded-xl font-bold text-xl border-2 border-blue-600/50 bg-blue-950/40 text-blue-200 hover:bg-blue-900/50 transition-all">
            + 100 mL
          </button>
          <button onClick={() => setFluidMl((v) => v + 250)}
            className="flex-1 min-h-[80px] rounded-xl font-bold text-xl border-2 border-blue-500 bg-blue-800/50 text-blue-100 hover:bg-blue-700/50 shadow-lg transition-all">
            + 250 mL
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <SectionLabel>Supplements</SectionLabel>
        <button onClick={() => setSupplementsGiven((v) => !v)}
          className={["w-full min-h-[72px] rounded-xl font-bold text-xl border-2 transition-all",
            supplementsGiven ? "bg-emerald-600 border-emerald-500 text-white shadow-lg" : "bg-card border-border text-foreground hover:border-emerald-500/50"].join(" ")}>
          {supplementsGiven ? "Supplements Given ✓" : "No Supplements"}
        </button>
      </section>

      <section className="space-y-3">
        <SectionLabel>SBAR Note</SectionLabel>
        <div className="bg-card border-2 border-border rounded-xl p-5 min-h-[72px] flex items-center shadow-inner">
          <p className="font-mono text-base text-foreground leading-relaxed w-full whitespace-pre-wrap">{note}</p>
        </div>
      </section>
    </FormShell>
  );
}

// ── ── ── Screen 3e: Falls Form ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──

function FallsForm({ resident, onBack }: { resident: Resident; onBack: () => void }) {
  const [witnessed, setWitnessed] = useState<boolean | null>(null);
  const [injury, setInjury] = useState<boolean | null>(null);
  const [neuroStarted, setNeuroStarted] = useState<boolean | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateStr);
  const [selectedHour, setSelectedHour] = useState<number>(getCurrentHour);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createFall = useCreateFallEvent();
  const { addNote: addNoteFall } = useNotesQueue();

  const note = useMemo(() => {
    const witnessStr = witnessed !== null ? (witnessed ? "Witnessed" : "Unwitnessed") : "Witness status pending";
    const injuryStr = injury !== null ? (injury ? "Apparent injury present" : "No apparent injury") : "Injury status pending";
    const neuroStr = neuroStarted !== null ? (neuroStarted ? "Neuro vitals initiated" : "Neuro vitals not yet initiated") : "Neuro status pending";
    const assessment = injury
      ? "Apparent injury — immediate assessment required."
      : "No apparent injury noted. Continued monitoring essential.";
    return `S: FALL EVENT. ${witnessStr} fall.\nB: ${resident.name}, Room ${resident.room}. ${injuryStr}. ${neuroStr}.\nA: ${assessment}\nR: Notify physician and charge nurse immediately. Complete incident report. Neuro vitals q1h × 4. Family notification required.`;
  }, [witnessed, injury, neuroStarted, resident]);

  const hasData = witnessed !== null || injury !== null || neuroStarted !== null;
  const handleReset = () => {
    setWitnessed(null); setInjury(null); setNeuroStarted(null);
    setSelectedDate(getTodayDateStr()); setSelectedHour(getCurrentHour());
  };

  const handleSave = () => {
    if (witnessed === null || injury === null || neuroStarted === null) {
      toast({ title: "Incomplete entry", description: "Answer all three questions.", variant: "destructive" }); return;
    }
    createFall.mutate({ data: { residentId: resident.id, isWitnessed: witnessed, apparentInjury: injury, neuroVitalsStarted: neuroStarted, clinicalNote: note, recordedAt: buildRecordedAt(selectedDate, selectedHour) } }, {
      onSuccess: async () => {
        try { await navigator.clipboard.writeText(note); } catch { /* blocked */ }
        queryClient.invalidateQueries({ queryKey: getGetPhysicianSummaryQueryKey() });
        addNoteFall({ patientName: resident.name, roomNumber: resident.room, content: note });
        toast({ title: "Saved & copied", description: "Fall event recorded." });
        handleReset(); onBack();
      },
      onError: () => toast({ title: "Save failed", variant: "destructive" }),
    });
  };

  const YesNoToggle = ({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean) => void }) => (
    <div className="space-y-2">
      <p className="text-sm font-bold text-red-300 uppercase tracking-widest">{label}</p>
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => onChange(true)} className={["min-h-[80px] rounded-xl font-bold text-xl border-2 transition-all", value === true ? "bg-red-600 border-red-400 text-white shadow-xl" : "bg-red-950/40 border-red-800/50 text-red-300 hover:border-red-500"].join(" ")}>Yes</button>
        <button onClick={() => onChange(false)} className={["min-h-[80px] rounded-xl font-bold text-xl border-2 transition-all", value === false ? "bg-slate-600 border-slate-400 text-white shadow-xl" : "bg-slate-900/60 border-slate-700/50 text-slate-300 hover:border-slate-500"].join(" ")}>No</button>
      </div>
    </div>
  );

  return (
    <FormShell resident={resident} title="FALL EVENT" badge="EMERGENCY" onBack={onBack} theme="emergency"
      onReset={handleReset} onSave={handleSave} hasData={hasData} isSaving={createFall.isPending} saveLabel="RECORD FALL EVENT">
      {/* Emergency banner */}
      <div className="bg-red-900/60 border-2 border-red-500/70 rounded-xl p-4 flex items-center gap-3">
        <AlertOctagon className="w-8 h-8 text-red-400 shrink-0" />
        <div>
          <p className="font-bold text-red-300 text-lg">FALL DOCUMENTATION</p>
          <p className="text-red-400/80 text-sm">Complete all fields immediately. Notify charge nurse.</p>
        </div>
      </div>

      <section className="space-y-3">
        <p className="text-xs font-bold text-red-400 uppercase tracking-widest">Date &amp; Time of Fall</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-center text-red-400/70 uppercase tracking-wider">Date</p>
            <ScrollPicker items={DATE_ITEMS} value={selectedDate} onChange={(v) => setSelectedDate(v as string)} />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-center text-red-400/70 uppercase tracking-wider">Time</p>
            <ScrollPicker items={HOUR_ITEMS} value={selectedHour} onChange={(v) => setSelectedHour(v as number)} />
          </div>
        </div>
      </section>

      <div className="space-y-6">
        <YesNoToggle label="Was the fall witnessed?" value={witnessed} onChange={setWitnessed} />
        <YesNoToggle label="Is there apparent injury?" value={injury} onChange={setInjury} />
        <YesNoToggle label="Neuro vitals initiated?" value={neuroStarted} onChange={setNeuroStarted} />
      </div>

      <section className="space-y-3">
        <SectionLabel>SBAR Note</SectionLabel>
        <div className="bg-red-950/40 border-2 border-red-800/50 rounded-xl p-5 min-h-[72px] flex items-center">
          <p className="font-mono text-base text-red-200 leading-relaxed w-full whitespace-pre-wrap">{note}</p>
        </div>
      </section>
    </FormShell>
  );
}

// ── ── ── Screen 3f: Vitals Form ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──

function VitalsForm({ resident, onBack }: { resident: Resident; onBack: () => void }) {
  const [temp, setTemp] = useState<string>("");
  const [bpSys, setBpSys] = useState<string>("");
  const [bpDia, setBpDia] = useState<string>("");
  const [hr, setHr] = useState<string>("");
  const [o2, setO2] = useState<string>("");
  const [weight, setWeight] = useState<string>("");
  const [manualAbnormal, setManualAbnormal] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createVital = useCreateVitalEvent();
  const { addNote: addNoteVital } = useNotesQueue();

  const n = (v: string) => v === "" ? null : parseFloat(v);
  const ni = (v: string) => v === "" ? null : parseInt(v, 10);

  const autoAbnormal = useMemo(() => {
    const t = n(temp), s = ni(bpSys), d = ni(bpDia), h = ni(hr), o = n(o2);
    if (t !== null && (t > 38.3 || t < 36)) return true;
    if (s !== null && (s > 140 || s < 90)) return true;
    if (d !== null && (d > 90 || d < 60)) return true;
    if (h !== null && (h > 100 || h < 60)) return true;
    if (o !== null && o < 95) return true;
    return false;
  }, [temp, bpSys, bpDia, hr, o2]);

  const isAbnormalFlag = autoAbnormal || manualAbnormal;

  const note = useMemo(() => {
    const parts: string[] = [];
    if (temp) parts.push(`Temp: ${temp}°F`);
    if (bpSys && bpDia) parts.push(`BP: ${bpSys}/${bpDia} mmHg`);
    if (hr) parts.push(`HR: ${hr} bpm`);
    if (o2) parts.push(`O2 Sat: ${o2}%`);
    if (weight) parts.push(`Wt: ${weight} lbs`);
    if (!parts.length) return "Awaiting documentation input...";
    const assessment = isAbnormalFlag
      ? "Abnormal values detected — clinical review required."
      : "All values within expected range.";
    const recommendation = isAbnormalFlag
      ? "Notify physician of abnormal findings. Increase monitoring frequency."
      : "Continue routine vital signs monitoring per care plan.";
    return `S: Vital signs recorded — ${parts.join(", ")}.\nB: ${resident.name}, Room ${resident.room}.\nA: ${assessment}\nR: ${recommendation}`;
  }, [temp, bpSys, bpDia, hr, o2, weight, isAbnormalFlag, resident]);

  const hasData = !!(temp || bpSys || bpDia || hr || o2 || weight);
  const handleReset = () => { setTemp(""); setBpSys(""); setBpDia(""); setHr(""); setO2(""); setWeight(""); setManualAbnormal(false); };

  const handleSave = () => {
    if (!hasData) { toast({ title: "Incomplete entry", description: "Enter at least one vital sign.", variant: "destructive" }); return; }
    createVital.mutate({ data: { residentId: resident.id, temp: n(temp) ?? undefined, bpSys: ni(bpSys) ?? undefined, bpDia: ni(bpDia) ?? undefined, hr: ni(hr) ?? undefined, o2: n(o2) ?? undefined, weight: n(weight) ?? undefined, isAbnormalFlag, clinicalNote: note } }, {
      onSuccess: async () => {
        try { await navigator.clipboard.writeText(note); } catch { /* blocked */ }
        queryClient.invalidateQueries({ queryKey: getGetPhysicianSummaryQueryKey() });
        addNoteVital({ patientName: resident.name, roomNumber: resident.room, content: note });
        toast({ title: "Saved & copied", description: "Vitals recorded." });
        handleReset(); onBack();
      },
      onError: () => toast({ title: "Save failed", variant: "destructive" }),
    });
  };

  const VitalInput = ({ label, value, onChange, placeholder, unit, step }: {
    label: string; value: string; onChange: (v: string) => void; placeholder: string; unit: string; step?: string;
  }) => (
    <div className="bg-card border border-border rounded-xl p-4 space-y-2">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <div className="flex items-baseline gap-2">
        <input type="number" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} step={step ?? "1"}
          className="flex-1 bg-transparent text-4xl font-bold text-foreground placeholder:text-muted-foreground/30 outline-none w-full" />
        <span className="text-muted-foreground text-sm font-medium shrink-0">{unit}</span>
      </div>
    </div>
  );

  return (
    <FormShell resident={resident} title="Vital Signs" onBack={onBack}
      onReset={handleReset} onSave={handleSave} hasData={hasData} isSaving={createVital.isPending}>
      {autoAbnormal && (
        <div className="bg-amber-900/40 border border-amber-600/50 rounded-xl p-3 flex items-center gap-2">
          <AlertOctagon className="w-5 h-5 text-amber-400 shrink-0" />
          <p className="text-amber-300 text-sm font-semibold">Abnormal values detected — flagged automatically.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <VitalInput label="Temperature" value={temp} onChange={setTemp} placeholder="98.6" unit="°F" step="0.1" />
        <VitalInput label="Heart Rate" value={hr} onChange={setHr} placeholder="72" unit="bpm" />
        <VitalInput label="BP Systolic" value={bpSys} onChange={setBpSys} placeholder="120" unit="mmHg" />
        <VitalInput label="BP Diastolic" value={bpDia} onChange={setBpDia} placeholder="80" unit="mmHg" />
        <VitalInput label="O2 Saturation" value={o2} onChange={setO2} placeholder="98" unit="%" step="0.1" />
        <VitalInput label="Weight" value={weight} onChange={setWeight} placeholder="140" unit="lbs" step="0.1" />
      </div>

      <section className="space-y-3">
        <SectionLabel>Abnormal Flag (override)</SectionLabel>
        <button onClick={() => setManualAbnormal((v) => !v)}
          className={["w-full min-h-[72px] rounded-xl font-bold text-xl border-2 transition-all",
            isAbnormalFlag ? "bg-red-700/50 border-red-500 text-red-200 shadow-lg" : "bg-card border-border text-foreground hover:border-red-500/50"].join(" ")}>
          {isAbnormalFlag ? "⚠️ Values Flagged as Abnormal" : "Mark as Normal"}
        </button>
      </section>

      <section className="space-y-3">
        <SectionLabel>SBAR Note</SectionLabel>
        <div className="bg-card border-2 border-border rounded-xl p-5 min-h-[72px] flex items-center shadow-inner">
          <p className="font-mono text-base text-foreground leading-relaxed w-full whitespace-pre-wrap">{note}</p>
        </div>
      </section>
    </FormShell>
  );
}

// ── ── ── Screen 3g: Message MD Form ── ── ── ── ── ── ── ── ── ── ── ── ── ──

function MessageForm({ resident, onBack }: { resident: Resident; onBack: () => void }) {
  const [messageText, setMessageText] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createBinder = useCreateBinderEntry();

  const handleSend = () => {
    const trimmed = messageText.trim();
    if (!trimmed) {
      toast({ title: "Empty message", description: "Please type a message before sending.", variant: "destructive" });
      return;
    }
    createBinder.mutate({ data: { residentId: resident.id, messageText: trimmed } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListBinderEntriesQueryKey() });
        toast({ title: "Sent to Binder", description: "Message posted to the Virtual Communication Binder." });
        setMessageText("");
        onBack();
      },
      onError: () => toast({ title: "Send failed", variant: "destructive" }),
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-30 bg-card border-b border-border px-4 py-3 flex items-center gap-4 shadow-md">
        <button onClick={onBack} className="flex items-center justify-center w-11 h-11 rounded-full hover:bg-muted transition-colors shrink-0">
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-base text-foreground leading-none truncate">{resident.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Room {resident.room} — Message MD / Virtual Binder</p>
        </div>
        <span className="bg-sky-500/10 text-sky-400 border border-sky-500/20 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest shrink-0">Binder</span>
      </header>

      <main className="max-w-2xl mx-auto w-full p-6 space-y-6">
        <div className="bg-sky-950/40 border-2 border-sky-700/50 rounded-xl p-4 flex items-start gap-3">
          <Megaphone className="w-6 h-6 text-sky-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-sky-300 text-base">Message to Physician</p>
            <p className="text-sky-400/70 text-sm mt-0.5">This message will appear in the Virtual Communication Binder visible to the attending physician.</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Message</p>
          <textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            rows={6}
            placeholder="Describe the clinical concern, observation, or question for the physician..."
            className="w-full bg-card border-2 border-border rounded-xl p-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-sky-500/60 text-base resize-none leading-relaxed"
          />
          <p className="text-xs text-muted-foreground text-right">{messageText.length} characters</p>
        </div>

        <button
          onClick={handleSend}
          disabled={createBinder.isPending || !messageText.trim()}
          className="w-full min-h-[72px] rounded-xl font-bold text-xl border-2 border-sky-500 bg-sky-800/50 text-sky-100 hover:bg-sky-700/60 active:scale-[0.98] transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3">
          <Megaphone className="w-6 h-6" />
          {createBinder.isPending ? "Sending..." : "SEND TO BINDER"}
        </button>
      </main>
    </div>
  );
}

// ── Root Export ───────────────────────────────────────────────────────────────

function BowelMovementLogInner() {
  const [view, setView] = useState<ViewState>("list");
  const [resident, setResident] = useState<Resident | null>(null);

  const selectResident = (r: Resident) => { setResident(r); setView("hub"); };
  const goToModule = (m: ViewState) => setView(m);
  const goToHub = () => setView("hub");
  const goToList = () => { setView("list"); setResident(null); };

  if (view === "list" || !resident) return <ResidentList onSelect={selectResident} />;
  if (view === "hub")      return <ModuleHub resident={resident} onSelectModule={goToModule} onBack={goToList} />;
  if (view === "bowel")    return <BowelForm resident={resident} onBack={goToHub} />;
  if (view === "pain")     return <PainForm resident={resident} onBack={goToHub} />;
  if (view === "behavior") return <BehaviorForm resident={resident} onBack={goToHub} />;
  if (view === "intake")   return <IntakeForm resident={resident} onBack={goToHub} />;
  if (view === "falls")    return <FallsForm resident={resident} onBack={goToHub} />;
  if (view === "vitals")   return <VitalsForm resident={resident} onBack={goToHub} />;
  if (view === "message")  return <MessageForm resident={resident} onBack={goToHub} />;
  return null;
}

export default function BowelMovementLog() {
  return (
    <NotesQueueProvider>
      <BowelMovementLogInner />
    </NotesQueueProvider>
  );
}
