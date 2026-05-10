import { useState, useEffect, useMemo } from "react";
import {
  Clock,
  Star,
  ChevronRight,
  ArrowLeft,
  Search,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useListResidents,
  useToggleFavorite,
  useCreateBowelMovement,
  useGetPhysicianSummary,
  getGetPhysicianSummaryQueryKey,
  getListResidentsQueryKey,
} from "@workspace/api-client-react";
import type { Resident } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

// ── Types ─────────────────────────────────────────────────────────────────────

type StoolType = 1 | 2 | 3 | 4 | 5 | 6 | 7 | null;
type Amount = "Small" | "Medium" | "Large" | "XL" | null;
type ViewFilter = "all" | "favorites";

interface Flags {
  incontinence: boolean;
  blood: boolean;
  mucus: boolean;
  pain: boolean;
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function getClinicalNote(
  stoolType: StoolType,
  amount: Amount,
  flags: Flags,
): string {
  if (!stoolType && !amount && !Object.values(flags).some(Boolean)) {
    return "Awaiting documentation input...";
  }
  let note = "";
  if (stoolType && amount) {
    const desc = STOOL_TYPES.find((t) => t.id === stoolType)?.desc.toLowerCase() ?? "";
    note += `${amount}, Type ${stoolType} bowel movement. ${desc.charAt(0).toUpperCase() + desc.slice(1)}. `;
  } else if (stoolType) {
    const desc = STOOL_TYPES.find((t) => t.id === stoolType)?.desc.toLowerCase() ?? "";
    note += `Type ${stoolType} bowel movement. ${desc.charAt(0).toUpperCase() + desc.slice(1)}. `;
  } else if (amount) {
    note += `${amount} bowel movement. `;
  }
  if (stoolType || amount) {
    note += flags.incontinence ? "Incontinent. " : "Continent. ";
  }
  const extras: string[] = [];
  if (flags.blood) extras.push("Blood present");
  if (flags.mucus) extras.push("Mucus noted");
  if (flags.pain)  extras.push("Pain/straining observed");
  if (extras.length > 0) {
    note += extras.join(". ") + ". ";
  } else if (stoolType || amount) {
    note += "No blood, mucus, or pain noted. ";
  }
  if (flags.blood) note += "Clinical review recommended.";
  return note.trim();
}

// ── Gut Status Badge ──────────────────────────────────────────────────────────

function GutBadge({ level }: { level: "none" | "amber" | "red" | "unknown" }) {
  if (level === "none") {
    return (
      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
        Current
      </span>
    );
  }
  if (level === "amber") {
    return (
      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 whitespace-nowrap">
        48h+
      </span>
    );
  }
  if (level === "red") {
    return (
      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-600/20 text-red-400 border border-red-600/30 whitespace-nowrap">
        72h+
      </span>
    );
  }
  return (
    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-muted/60 text-muted-foreground border border-border whitespace-nowrap">
      No record
    </span>
  );
}

// ── Resident List Screen ──────────────────────────────────────────────────────

interface ResidentListProps {
  onSelect: (resident: Resident) => void;
}

function ResidentList({ onSelect }: ResidentListProps) {
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

  // Build a quick lookup: residentId → alertLevel
  const alertMap = useMemo<Partial<Record<number, "none" | "amber" | "red">>>(() => {
    const map: Partial<Record<number, "none" | "amber" | "red">> = {};
    for (const r of summary?.residents ?? []) {
      map[r.residentId] = r.alertLevel;
    }
    return map;
  }, [summary]);

  const filtered = useMemo(() => {
    let list = residents;
    if (filter === "favorites") list = list.filter((r) => r.isFavorited);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.room.toLowerCase().includes(q),
      );
    }
    return list;
  }, [residents, filter, search]);

  const handleStarClick = (e: React.MouseEvent, resident: Resident) => {
    e.stopPropagation();
    toggleFav.mutate(
      { residentId: resident.id, data: { isFavorited: !resident.isFavorited } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListResidentsQueryKey() });
        },
      },
    );
  };

  const favCount = residents.filter((r) => r.isFavorited).length;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-card border-b border-border px-6 py-3 flex items-center justify-between shadow-md shrink-0">
        <div>
          <p className="font-bold text-lg text-foreground leading-none">Bowel Movement Log</p>
          <p className="text-xs text-muted-foreground mt-0.5">Select a resident to document</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="bg-primary/10 text-primary border border-primary/20 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest">
            Care Aide Mode
          </span>
          <div className="flex items-center gap-1.5 font-mono text-base tabular-nums text-foreground">
            <Clock className="w-4 h-4 text-muted-foreground" />
            {time.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
        </div>
      </header>

      {/* Controls */}
      <div className="sticky top-[61px] z-20 bg-background border-b border-border px-6 py-3 space-y-3 shrink-0">
        {/* Filter toggle */}
        <div className="flex gap-2">
          <button
            data-testid="filter-all"
            onClick={() => setFilter("all")}
            className={[
              "flex-1 py-3 rounded-xl font-bold text-sm uppercase tracking-wider border-2 transition-all",
              filter === "all"
                ? "bg-primary border-primary text-primary-foreground shadow-md"
                : "bg-card border-border text-muted-foreground hover:border-primary/40",
            ].join(" ")}
          >
            All Residents ({residents.length})
          </button>
          <button
            data-testid="filter-favorites"
            onClick={() => setFilter("favorites")}
            className={[
              "flex-1 py-3 rounded-xl font-bold text-sm uppercase tracking-wider border-2 transition-all flex items-center justify-center gap-2",
              filter === "favorites"
                ? "bg-amber-500 border-amber-500 text-white shadow-md"
                : "bg-card border-border text-muted-foreground hover:border-amber-500/40",
            ].join(" ")}
          >
            <Star className={["w-4 h-4", filter === "favorites" ? "fill-white" : ""].join(" ")} />
            My Patients ({favCount})
          </button>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            data-testid="input-search"
            type="text"
            placeholder="Search by name or room number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-card border border-border rounded-xl pl-12 pr-10 py-3.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary text-base"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Resident list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="p-12 text-center text-muted-foreground">Loading residents...</div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="p-12 text-center space-y-2">
            <p className="text-muted-foreground font-medium">
              {filter === "favorites"
                ? "No patients starred yet."
                : "No residents match your search."}
            </p>
            {filter === "favorites" && (
              <p className="text-muted-foreground/60 text-sm">
                Tap the star next to a resident to add them to My Patients.
              </p>
            )}
          </div>
        )}

        <ul className="divide-y divide-border/60">
          {filtered.map((resident) => {
            const level = alertMap[resident.id] ?? "unknown";
            return (
              <li
                key={resident.id}
                data-testid={`row-resident-${resident.id}`}
                className="flex items-center gap-3 px-4 border-b border-border/40 last:border-0"
              >
                {/* Star button — 44×44 tap target */}
                <button
                  data-testid={`btn-star-${resident.id}`}
                  onClick={(e) => handleStarClick(e, resident)}
                  className="flex items-center justify-center w-11 h-11 rounded-full shrink-0 hover:bg-amber-500/10 active:bg-amber-500/20 transition-colors"
                  aria-label={resident.isFavorited ? "Remove from My Patients" : "Add to My Patients"}
                >
                  <Star
                    className={[
                      "w-6 h-6 transition-colors",
                      resident.isFavorited
                        ? "fill-amber-400 text-amber-400"
                        : "text-muted-foreground/30",
                    ].join(" ")}
                  />
                </button>

                {/* Room badge */}
                <span className="font-mono font-bold text-sm bg-muted/60 border border-border px-2.5 py-1 rounded-lg text-muted-foreground shrink-0 w-14 text-center">
                  {resident.room}
                </span>

                {/* Name + gut badge stacked */}
                <div className="flex-1 min-w-0 py-4">
                  <p className="font-semibold text-foreground text-base truncate">{resident.name}</p>
                  <div className="mt-1">
                    <GutBadge level={alertMap[resident.id] ?? "unknown"} />
                  </div>
                </div>

                {/* Tap-to-log button — large, obvious */}
                <button
                  onClick={() => onSelect(resident)}
                  className="shrink-0 flex items-center gap-1.5 bg-primary hover:bg-primary/80 active:scale-95 text-primary-foreground font-bold text-sm px-4 py-3 rounded-xl transition-all shadow-md shadow-primary/20"
                >
                  Log BM
                  <ChevronRight className="w-4 h-4" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// ── BM Log Form ───────────────────────────────────────────────────────────────

interface BMLogFormProps {
  resident: Resident;
  onBack: () => void;
}

function BMLogForm({ resident, onBack }: BMLogFormProps) {
  const [stoolType, setStoolType] = useState<StoolType>(null);
  const [amount, setAmount] = useState<Amount>(null);
  const [flags, setFlags] = useState<Flags>({
    incontinence: false,
    blood: false,
    mucus: false,
    pain: false,
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createBM = useCreateBowelMovement();

  const note = getClinicalNote(stoolType, amount, flags);
  const hasData = stoolType !== null || amount !== null || Object.values(flags).some(Boolean);

  const handleReset = () => {
    setStoolType(null);
    setAmount(null);
    setFlags({ incontinence: false, blood: false, mucus: false, pain: false });
  };

  const handleSave = () => {
    if (!stoolType || !amount) {
      toast({
        title: "Incomplete entry",
        description: "Please select a stool type and amount before saving.",
        variant: "destructive",
      });
      return;
    }

    createBM.mutate(
      {
        data: {
          residentId: resident.id,
          bristolType: stoolType,
          amount,
          incontinence: flags.incontinence,
          bloodPresent: flags.blood,
          mucusPresent: flags.mucus,
          painStraining: flags.pain,
          clinicalNote: note,
        },
      },
      {
        onSuccess: async () => {
          try { await navigator.clipboard.writeText(note); } catch { /* blocked */ }
          queryClient.invalidateQueries({ queryKey: getGetPhysicianSummaryQueryKey() });
          toast({
            title: "Saved & copied",
            description: "Bowel movement recorded. Note copied to clipboard.",
          });
          handleReset();
          onBack();
        },
        onError: () => {
          toast({
            title: "Save failed",
            description: "Could not save to database. Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-36">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-card border-b border-border px-4 py-3 flex items-center gap-4 shadow-md">
        <button
          data-testid="btn-back"
          onClick={onBack}
          className="flex items-center justify-center w-11 h-11 rounded-full hover:bg-muted transition-colors shrink-0"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-base text-foreground leading-none truncate">{resident.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Room {resident.room} · Bowel Movement Log</p>
        </div>
        <span className="bg-primary/10 text-primary border border-primary/20 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest shrink-0">
          Care Aide
        </span>
      </header>

      <main className="max-w-5xl mx-auto p-6 space-y-8">
        {/* Bristol Stool Scale */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Stool Type (Bristol Scale)
          </h2>
          <div className="grid grid-cols-7 gap-2">
            {STOOL_TYPES.map((type) => {
              const isSelected = stoolType === type.id;
              return (
                <button
                  key={type.id}
                  onClick={() => setStoolType(isSelected ? null : (type.id as StoolType))}
                  data-testid={`btn-stool-type-${type.id}`}
                  className={[
                    "flex flex-col items-center justify-center p-2 min-h-[130px] rounded-xl border-4 transition-all duration-150 focus:outline-none",
                    isSelected
                      ? "border-primary scale-[1.04] shadow-xl shadow-primary/25 bg-card/90"
                      : "border-transparent bg-card hover:border-primary/40",
                  ].join(" ")}
                >
                  <div
                    className={["w-12 h-12 rounded-full flex items-center justify-center mb-2 text-lg font-bold", type.color, type.text].join(" ")}
                  >
                    {type.id}
                  </div>
                  <span className="text-center text-xs font-medium leading-tight text-foreground">{type.desc}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Amount */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Amount</h2>
          <div className="grid grid-cols-4 gap-3">
            {(["Small", "Medium", "Large", "XL"] as const).map((amt) => (
              <button
                key={amt}
                onClick={() => setAmount(amount === amt ? null : amt)}
                data-testid={`btn-amount-${amt.toLowerCase()}`}
                className={[
                  "min-h-[80px] rounded-xl font-bold text-xl border-2 transition-all duration-150 focus:outline-none",
                  amount === amt
                    ? "bg-primary border-primary text-primary-foreground shadow-lg shadow-primary/25"
                    : "bg-card border-border text-foreground hover:border-primary/50",
                ].join(" ")}
              >
                {amt}
              </button>
            ))}
          </div>
        </section>

        {/* Clinical Flags */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Clinical Flags</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: "incontinence" as const, label: "Incontinence",    active: "bg-amber-500 border-amber-500 text-white shadow-amber-500/25",    inactive: "hover:border-amber-500/50",  id: "btn-flag-incontinence" },
              { key: "blood"        as const, label: "Blood Present",   active: "bg-red-600 border-red-600 text-white shadow-red-600/30",           inactive: "hover:border-red-600/50",    id: "btn-flag-blood" },
              { key: "mucus"        as const, label: "Mucus Present",   active: "bg-yellow-500 border-yellow-500 text-white shadow-yellow-500/25",  inactive: "hover:border-yellow-500/50", id: "btn-flag-mucus" },
              { key: "pain"         as const, label: "Pain / Straining",active: "bg-purple-500 border-purple-500 text-white shadow-purple-500/25",  inactive: "hover:border-purple-500/50", id: "btn-flag-pain" },
            ].map((flag) => (
              <button
                key={flag.key}
                onClick={() => setFlags((f) => ({ ...f, [flag.key]: !f[flag.key] }))}
                data-testid={flag.id}
                className={[
                  "min-h-[80px] rounded-xl font-bold text-xl border-2 transition-all duration-150 shadow-lg focus:outline-none",
                  flags[flag.key]
                    ? flag.active
                    : "bg-card border-border text-foreground " + flag.inactive,
                ].join(" ")}
              >
                {flag.label}
              </button>
            ))}
          </div>
        </section>

        {/* Clinical Note */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Generated Clinical Note
          </h2>
          <div className="bg-card border-2 border-border rounded-xl p-5 min-h-[90px] flex items-center shadow-inner">
            <p className="font-mono text-base text-foreground leading-relaxed w-full" data-testid="text-clinical-note">
              {note}
            </p>
          </div>
        </section>
      </main>

      {/* Sticky Action Bar */}
      <footer className="fixed bottom-0 left-0 right-0 bg-card border-t border-border px-6 py-4 shadow-[0_-8px_24px_rgba(0,0,0,0.25)] z-50">
        <div className="max-w-5xl mx-auto flex gap-4">
          <button
            onClick={handleReset}
            data-testid="btn-reset"
            disabled={!hasData}
            className="w-[28%] min-h-[72px] rounded-xl font-bold text-base border-2 border-muted-foreground/50 text-muted-foreground hover:bg-muted disabled:opacity-40 transition-colors uppercase tracking-widest"
          >
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={createBM.isPending}
            data-testid="btn-save"
            className="w-[72%] min-h-[72px] rounded-xl font-bold text-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all uppercase tracking-widest shadow-lg shadow-primary/30"
          >
            {createBM.isPending ? "Saving..." : "Copy to EMR & Save"}
          </button>
        </div>
      </footer>
    </div>
  );
}

// ── Root Export ───────────────────────────────────────────────────────────────

export default function BowelMovementLog() {
  const [selectedResident, setSelectedResident] = useState<Resident | null>(null);

  if (selectedResident) {
    return (
      <BMLogForm
        resident={selectedResident}
        onBack={() => setSelectedResident(null)}
      />
    );
  }

  return <ResidentList onSelect={setSelectedResident} />;
}
