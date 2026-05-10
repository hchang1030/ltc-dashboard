import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Clock, Star, ChevronRight, ArrowLeft, Search, X,
  Droplets, Zap, Brain, Utensils, AlertOctagon, Activity,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useListResidents,
  useToggleFavorite,
  useCreateBowelMovement,
  useCreatePainEvent,
  useCreateBehaviorEvent,
  useCreateIntakeEvent,
  useCreateFallEvent,
  useCreateVitalEvent,
  useGetPhysicianSummary,
  getGetPhysicianSummaryQueryKey,
  getListResidentsQueryKey,
} from "@workspace/api-client-react";
import type { Resident } from "@workspace/api-client-react";
import type { PainEventInputSeverity, PainEventInputLocation, BehaviorEventInputType, IntakeEventInputMealPercent } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

// ── Types ─────────────────────────────────────────────────────────────────────

type ViewState = "list" | "hub" | "bowel" | "pain" | "behavior" | "intake" | "falls" | "vitals";
type StoolType = 1 | 2 | 3 | 4 | 5 | 6 | 7 | null;
type Amount = "Small" | "Medium" | "Large" | "XL" | null;
type ViewFilter = "all" | "favorites";
interface BowelFlags { incontinence: boolean; blood: boolean; mucus: boolean; pain: boolean; }

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
          {badge ?? "Care Aide"}
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

function ResidentList({ onSelect }: { onSelect: (r: Resident) => void }) {
  const [filter, setFilter] = useState<ViewFilter>("all");
  const [search, setSearch] = useState("");
  const [time, setTime] = useState(new Date());

  const queryClient = useQueryClient();
  const { data: residents = [], isLoading } = useListResidents();
  const { data: summary } = useGetPhysicianSummary({
    query: { queryKey: getGetPhysicianSummaryQueryKey(), refetchInterval: 60_000 },
  });
  const toggleFav = useToggleFavorite();

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const alertMap = useMemo<Partial<Record<number, "none" | "amber" | "red">>>(() => {
    const map: Partial<Record<number, "none" | "amber" | "red">> = {};
    for (const r of summary?.residents ?? []) map[r.residentId] = r.alertLevel;
    return map;
  }, [summary]);

  const filtered = useMemo(() => {
    let list = residents;
    if (filter === "favorites") list = list.filter((r) => r.isFavorited);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(q) || r.room.toLowerCase().includes(q));
    }
    return list;
  }, [residents, filter, search]);

  const favCount = residents.filter((r) => r.isFavorited).length;

  const handleStar = (e: React.MouseEvent, resident: Resident) => {
    e.stopPropagation();
    toggleFav.mutate(
      { residentId: resident.id, data: { isFavorited: !resident.isFavorited } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListResidentsQueryKey() }) },
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-30 bg-card border-b border-border px-6 py-3 flex items-center justify-between shadow-md shrink-0">
        <div>
          <p className="font-bold text-lg text-foreground leading-none">Care Aide — Event Hub</p>
          <p className="text-xs text-muted-foreground mt-0.5">Select a resident to log an event</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="bg-primary/10 text-primary border border-primary/20 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest">Care Aide</span>
          <div className="flex items-center gap-1.5 font-mono text-base tabular-nums text-foreground">
            <Clock className="w-4 h-4 text-muted-foreground" />
            {time.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
        </div>
      </header>

      <div className="sticky top-[61px] z-20 bg-background border-b border-border px-6 py-3 space-y-3 shrink-0">
        <div className="flex gap-2">
          <button onClick={() => setFilter("all")}
            className={["flex-1 py-3 rounded-xl font-bold text-sm uppercase tracking-wider border-2 transition-all",
              filter === "all" ? "bg-primary border-primary text-primary-foreground shadow-md" : "bg-card border-border text-muted-foreground hover:border-primary/40"].join(" ")}>
            All Residents ({residents.length})
          </button>
          <button onClick={() => setFilter("favorites")}
            className={["flex-1 py-3 rounded-xl font-bold text-sm uppercase tracking-wider border-2 transition-all flex items-center justify-center gap-2",
              filter === "favorites" ? "bg-amber-500 border-amber-500 text-white shadow-md" : "bg-card border-border text-muted-foreground hover:border-amber-500/40"].join(" ")}>
            <Star className={["w-4 h-4", filter === "favorites" ? "fill-white" : ""].join(" ")} />
            My Patients ({favCount})
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input type="text" placeholder="Search by name or room number..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-card border border-border rounded-xl pl-12 pr-10 py-3.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-base" />
          {search && <button onClick={() => setSearch("")} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>}
        </div>
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
          {filtered.map((resident) => (
            <li key={resident.id} className="flex items-center gap-3 px-4 border-b border-border/40 last:border-0">
              <button onClick={(e) => handleStar(e, resident)}
                className="flex items-center justify-center w-11 h-11 rounded-full shrink-0 hover:bg-amber-500/10 active:bg-amber-500/20 transition-colors">
                <Star className={["w-6 h-6 transition-colors", resident.isFavorited ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"].join(" ")} />
              </button>
              <span className="font-mono font-bold text-sm bg-muted/60 border border-border px-2.5 py-1 rounded-lg text-muted-foreground shrink-0 w-14 text-center">
                {resident.room}
              </span>
              <div className="flex-1 min-w-0 py-4">
                <p className="font-semibold text-foreground text-base truncate">{resident.name}</p>
                <div className="mt-1"><GutBadge level={alertMap[resident.id] ?? "unknown"} /></div>
              </div>
              <button onClick={() => onSelect(resident)}
                className="shrink-0 flex items-center gap-1.5 bg-primary hover:bg-primary/80 active:scale-95 text-primary-foreground font-bold text-sm px-4 py-3 rounded-xl transition-all shadow-md shadow-primary/20">
                Log Event <ChevronRight className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
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
];

function ModuleHub({ resident, onSelectModule, onBack }: {
  resident: Resident; onSelectModule: (m: ViewState) => void; onBack: () => void;
}) {
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
        <span className="bg-primary/10 text-primary border border-primary/20 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest shrink-0">Care Aide</span>
      </header>

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

  const note = useMemo(() => {
    if (!stoolType && !amount && !Object.values(flags).some(Boolean)) return "Awaiting documentation input...";
    let n = "";
    if (stoolType && amount) {
      const desc = STOOL_TYPES.find((t) => t.id === stoolType)?.desc.toLowerCase() ?? "";
      n += `${amount}, Type ${stoolType} bowel movement. ${desc.charAt(0).toUpperCase() + desc.slice(1)}. `;
    } else if (stoolType) {
      n += `Type ${stoolType} bowel movement. `;
    } else if (amount) {
      n += `${amount} bowel movement. `;
    }
    if (stoolType || amount) n += flags.incontinence ? "Incontinent. " : "Continent. ";
    const extras: string[] = [];
    if (flags.blood) extras.push("Blood present");
    if (flags.mucus) extras.push("Mucus noted");
    if (flags.pain)  extras.push("Pain/straining observed");
    if (extras.length) n += extras.join(". ") + ". ";
    else if (stoolType || amount) n += "No blood, mucus, or pain noted. ";
    if (flags.blood) n += "Clinical review recommended.";
    return n.trim();
  }, [stoolType, amount, flags]);

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
        <SectionLabel>Generated Clinical Note</SectionLabel>
        <div className="bg-card border-2 border-border rounded-xl p-5 min-h-[90px] flex items-center shadow-inner">
          <p className="font-mono text-base text-foreground leading-relaxed w-full">{note}</p>
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

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createPain = useCreatePainEvent();

  const note = useMemo(() => {
    if (!severity) return "Awaiting documentation input...";
    let n = `${severity} pain reported.`;
    if (location) n += ` Location: ${location}.`;
    n += ` PRN ${prnGiven ? "given" : "not given"}.`;
    if (severity === "Severe") n += " Physician review recommended.";
    return n;
  }, [severity, location, prnGiven]);

  const hasData = !!severity;

  const handleReset = () => { setSeverity(null); setLocation(null); setPrnGiven(false); };

  const handleSave = () => {
    if (!severity || !location) { toast({ title: "Incomplete entry", description: "Select severity and location.", variant: "destructive" }); return; }
    createPain.mutate({ data: { residentId: resident.id, severity, location, prnGiven, clinicalNote: note } }, {
      onSuccess: async () => {
        try { await navigator.clipboard.writeText(note); } catch { /* blocked */ }
        queryClient.invalidateQueries({ queryKey: getGetPhysicianSummaryQueryKey() });
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
        <SectionLabel>Generated Clinical Note</SectionLabel>
        <div className="bg-card border-2 border-border rounded-xl p-5 min-h-[72px] flex items-center shadow-inner">
          <p className="font-mono text-base text-foreground leading-relaxed w-full">{note}</p>
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

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createBehavior = useCreateBehaviorEvent();

  const note = useMemo(() => {
    if (!type) return "Awaiting documentation input...";
    let n = `${type} behavior observed.`;
    if (intensity) n += ` Intensity: ${intensity}.`;
    if (duration) n += ` Duration: approximately ${duration} minutes.`;
    return n;
  }, [type, intensity, duration]);

  const hasData = !!type;
  const handleReset = () => { setType(null); setIntensity(null); setDuration(null); };

  const handleSave = () => {
    if (!type || !intensity) { toast({ title: "Incomplete entry", description: "Select behavior type and intensity.", variant: "destructive" }); return; }
    createBehavior.mutate({ data: { residentId: resident.id, type, intensity, durationMins: duration ?? undefined, clinicalNote: note } }, {
      onSuccess: async () => {
        try { await navigator.clipboard.writeText(note); } catch { /* blocked */ }
        queryClient.invalidateQueries({ queryKey: getGetPhysicianSummaryQueryKey() });
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
        <SectionLabel>Generated Clinical Note</SectionLabel>
        <div className="bg-card border-2 border-border rounded-xl p-5 min-h-[72px] flex items-center shadow-inner">
          <p className="font-mono text-base text-foreground leading-relaxed w-full">{note}</p>
        </div>
      </section>
    </FormShell>
  );
}

// ── ── ── Screen 3d: Intake Form ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──

function IntakeForm({ resident, onBack }: { resident: Resident; onBack: () => void }) {
  const [mealPercent, setMealPercent] = useState<IntakeEventInputMealPercent | null>(null);
  const [fluidMl, setFluidMl] = useState(0);
  const [supplementsGiven, setSupplementsGiven] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createIntake = useCreateIntakeEvent();

  const note = useMemo(() => {
    if (mealPercent === null && fluidMl === 0) return "Awaiting documentation input...";
    let n = "";
    if (mealPercent !== null) n += `Consumed ${mealPercent}% of meal offering. `;
    if (fluidMl > 0) n += `Fluid intake: ${fluidMl}mL. `;
    n += `Supplements: ${supplementsGiven ? "given" : "not given"}.`;
    return n.trim();
  }, [mealPercent, fluidMl, supplementsGiven]);

  const hasData = mealPercent !== null || fluidMl > 0;
  const handleReset = () => { setMealPercent(null); setFluidMl(0); setSupplementsGiven(false); };

  const handleSave = () => {
    if (mealPercent === null) { toast({ title: "Incomplete entry", description: "Select a meal percentage.", variant: "destructive" }); return; }
    createIntake.mutate({ data: { residentId: resident.id, mealPercent, fluidMl, supplementsGiven, clinicalNote: note } }, {
      onSuccess: async () => {
        try { await navigator.clipboard.writeText(note); } catch { /* blocked */ }
        queryClient.invalidateQueries({ queryKey: getGetPhysicianSummaryQueryKey() });
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
        <SectionLabel>Generated Clinical Note</SectionLabel>
        <div className="bg-card border-2 border-border rounded-xl p-5 min-h-[72px] flex items-center shadow-inner">
          <p className="font-mono text-base text-foreground leading-relaxed w-full">{note}</p>
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

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createFall = useCreateFallEvent();

  const note = useMemo(() => {
    const parts: string[] = ["FALL EVENT RECORDED."];
    if (witnessed !== null) parts.push(witnessed ? "Witnessed." : "Unwitnessed.");
    if (injury !== null) parts.push(injury ? "Apparent injury present." : "No apparent injury noted.");
    if (neuroStarted !== null) parts.push(neuroStarted ? "Neuro vitals initiated." : "Neuro vitals not yet initiated.");
    return parts.join(" ");
  }, [witnessed, injury, neuroStarted]);

  const hasData = witnessed !== null || injury !== null || neuroStarted !== null;
  const handleReset = () => { setWitnessed(null); setInjury(null); setNeuroStarted(null); };

  const handleSave = () => {
    if (witnessed === null || injury === null || neuroStarted === null) {
      toast({ title: "Incomplete entry", description: "Answer all three questions.", variant: "destructive" }); return;
    }
    createFall.mutate({ data: { residentId: resident.id, isWitnessed: witnessed, apparentInjury: injury, neuroVitalsStarted: neuroStarted, clinicalNote: note } }, {
      onSuccess: async () => {
        try { await navigator.clipboard.writeText(note); } catch { /* blocked */ }
        queryClient.invalidateQueries({ queryKey: getGetPhysicianSummaryQueryKey() });
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

      <div className="space-y-6">
        <YesNoToggle label="Was the fall witnessed?" value={witnessed} onChange={setWitnessed} />
        <YesNoToggle label="Is there apparent injury?" value={injury} onChange={setInjury} />
        <YesNoToggle label="Neuro vitals initiated?" value={neuroStarted} onChange={setNeuroStarted} />
      </div>

      <section className="space-y-3">
        <SectionLabel>Generated Clinical Note</SectionLabel>
        <div className="bg-red-950/40 border-2 border-red-800/50 rounded-xl p-5 min-h-[72px] flex items-center">
          <p className="font-mono text-base text-red-200 leading-relaxed w-full">{note}</p>
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
    return parts.join(", ") + ". " + (isAbnormalFlag ? "Abnormal values flagged — clinical review recommended." : "All values within expected range.");
  }, [temp, bpSys, bpDia, hr, o2, weight, isAbnormalFlag]);

  const hasData = !!(temp || bpSys || bpDia || hr || o2 || weight);
  const handleReset = () => { setTemp(""); setBpSys(""); setBpDia(""); setHr(""); setO2(""); setWeight(""); setManualAbnormal(false); };

  const handleSave = () => {
    if (!hasData) { toast({ title: "Incomplete entry", description: "Enter at least one vital sign.", variant: "destructive" }); return; }
    createVital.mutate({ data: { residentId: resident.id, temp: n(temp) ?? undefined, bpSys: ni(bpSys) ?? undefined, bpDia: ni(bpDia) ?? undefined, hr: ni(hr) ?? undefined, o2: n(o2) ?? undefined, weight: n(weight) ?? undefined, isAbnormalFlag, clinicalNote: note } }, {
      onSuccess: async () => {
        try { await navigator.clipboard.writeText(note); } catch { /* blocked */ }
        queryClient.invalidateQueries({ queryKey: getGetPhysicianSummaryQueryKey() });
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
        <SectionLabel>Generated Clinical Note</SectionLabel>
        <div className="bg-card border-2 border-border rounded-xl p-5 min-h-[72px] flex items-center shadow-inner">
          <p className="font-mono text-base text-foreground leading-relaxed w-full">{note}</p>
        </div>
      </section>
    </FormShell>
  );
}

// ── Root Export ───────────────────────────────────────────────────────────────

export default function BowelMovementLog() {
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
  return null;
}
