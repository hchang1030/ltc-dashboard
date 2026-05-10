import { useState, useEffect } from "react";
import { Clock, User, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useListResidents,
  useCreateBowelMovement,
  getGetPhysicianSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

type StoolType = 1 | 2 | 3 | 4 | 5 | 6 | 7 | null;
type Amount = "Small" | "Medium" | "Large" | "XL" | null;

interface Flags {
  incontinence: boolean;
  blood: boolean;
  mucus: boolean;
  pain: boolean;
}

const STOOL_TYPES = [
  { id: 1, desc: "Separate hard lumps", color: "bg-[#2d1b11]", textColor: "text-white" },
  { id: 2, desc: "Lumpy sausage", color: "bg-[#3e2723]", textColor: "text-white" },
  { id: 3, desc: "Cracked surface", color: "bg-[#5d4037]", textColor: "text-white" },
  { id: 4, desc: "Smooth & soft", color: "bg-[#795548]", textColor: "text-white" },
  { id: 5, desc: "Soft blobs", color: "bg-[#bcaaa4]", textColor: "text-[#1a1a1a]" },
  { id: 6, desc: "Fluffy pieces", color: "bg-[#d7ccc8]", textColor: "text-[#1a1a1a]" },
  { id: 7, desc: "Entirely liquid", color: "bg-[#efebe9]", textColor: "text-[#1a1a1a]" },
] as const;

export default function BowelMovementLog() {
  const [time, setTime] = useState(new Date());
  const [residentId, setResidentId] = useState<number | null>(null);
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
  const { data: residents = [] } = useListResidents();
  const createBM = useCreateBowelMovement();

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (residents.length > 0 && residentId === null) {
      setResidentId(residents[0].id);
    }
  }, [residents, residentId]);

  const selectedResident = residents.find((r) => r.id === residentId) ?? null;

  const handleReset = () => {
    setStoolType(null);
    setAmount(null);
    setFlags({ incontinence: false, blood: false, mucus: false, pain: false });
  };

  const getClinicalNote = (): string => {
    if (!stoolType && !amount && !Object.values(flags).some(Boolean)) {
      return "Awaiting documentation input...";
    }

    let note = "";

    if (stoolType && amount) {
      const typeDesc = STOOL_TYPES.find((t) => t.id === stoolType)?.desc.toLowerCase() ?? "";
      note += `${amount}, Type ${stoolType} bowel movement. ${typeDesc.charAt(0).toUpperCase() + typeDesc.slice(1)}. `;
    } else if (stoolType) {
      const typeDesc = STOOL_TYPES.find((t) => t.id === stoolType)?.desc.toLowerCase() ?? "";
      note += `Type ${stoolType} bowel movement. ${typeDesc.charAt(0).toUpperCase() + typeDesc.slice(1)}. `;
    } else if (amount) {
      note += `${amount} bowel movement. `;
    }

    if (stoolType || amount) {
      note += flags.incontinence ? "Incontinent. " : "Continent. ";
    }

    const extras: string[] = [];
    if (flags.blood) extras.push("Blood present");
    if (flags.mucus) extras.push("Mucus noted");
    if (flags.pain) extras.push("Pain/straining observed");

    if (extras.length > 0) {
      note += extras.join(". ") + ". ";
    } else if (stoolType || amount) {
      note += "No blood, mucus, or pain noted. ";
    }

    if (flags.blood) {
      note += "Clinical review recommended.";
    }

    return note.trim();
  };

  const hasData = stoolType !== null || amount !== null || Object.values(flags).some(Boolean);

  const handleSave = async () => {
    const note = getClinicalNote();
    if (!hasData || !residentId || !stoolType || !amount) {
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
          residentId,
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
          try {
            await navigator.clipboard.writeText(note);
          } catch {
            // clipboard may be blocked in some contexts, don't fail the save
          }
          queryClient.invalidateQueries({ queryKey: getGetPhysicianSummaryQueryKey() });
          toast({
            title: "Saved & copied to clipboard",
            description: "Bowel movement recorded. Note copied to clipboard.",
          });
          handleReset();
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
      {/* Patient Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border px-6 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <div className="bg-primary/20 p-2 rounded-full shrink-0">
            <User className="w-5 h-5 text-primary" />
          </div>
          <div className="relative">
            <select
              data-testid="select-resident"
              value={residentId ?? ""}
              onChange={(e) => setResidentId(Number(e.target.value))}
              className="appearance-none bg-transparent font-bold text-foreground text-lg pr-8 focus:outline-none cursor-pointer"
            >
              {residents.map((r) => (
                <option key={r.id} value={r.id} className="bg-card text-foreground">
                  {r.name} — Room {r.room}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          </div>
        </div>

        <div className="absolute left-1/2 -translate-x-1/2 font-bold text-xl tracking-tight text-foreground">
          Bowel Movement Log
        </div>

        <div className="flex items-center gap-4">
          <span className="bg-primary/10 text-primary border border-primary/20 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest">
            Care Aide Mode
          </span>
          <div className="flex items-center gap-2 font-mono text-lg tabular-nums text-foreground">
            <Clock className="w-4 h-4 text-muted-foreground" />
            {time.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-8 space-y-10">
        {/* Bristol Stool Scale */}
        <section className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Stool Type (Bristol Scale)
          </h2>
          <div className="grid grid-cols-7 gap-3">
            {STOOL_TYPES.map((type) => {
              const isSelected = stoolType === type.id;
              return (
                <button
                  key={type.id}
                  onClick={() => setStoolType(isSelected ? null : (type.id as StoolType))}
                  data-testid={`btn-stool-type-${type.id}`}
                  className={[
                    "flex flex-col items-center justify-center p-3 min-h-[140px] rounded-xl border-4 transition-all duration-150 focus:outline-none",
                    isSelected
                      ? "border-primary scale-[1.03] shadow-xl shadow-primary/25 bg-card/90"
                      : "border-transparent bg-card hover:border-primary/40",
                  ].join(" ")}
                >
                  <div
                    className={[
                      "w-14 h-14 rounded-full flex items-center justify-center mb-2 text-xl font-bold shadow-inner",
                      type.color,
                      type.textColor,
                    ].join(" ")}
                  >
                    {type.id}
                  </div>
                  <span className="text-center text-sm font-medium leading-tight text-foreground">
                    {type.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Amount Selection */}
        <section className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Amount
          </h2>
          <div className="grid grid-cols-4 gap-4">
            {(["Small", "Medium", "Large", "XL"] as const).map((amt) => {
              const isSelected = amount === amt;
              return (
                <button
                  key={amt}
                  onClick={() => setAmount(isSelected ? null : amt)}
                  data-testid={`btn-amount-${amt.toLowerCase()}`}
                  className={[
                    "min-h-[88px] rounded-xl font-bold text-xl border-2 transition-all duration-150 focus:outline-none",
                    isSelected
                      ? "bg-primary border-primary text-primary-foreground shadow-lg shadow-primary/25"
                      : "bg-card border-border text-foreground hover:border-primary/50",
                  ].join(" ")}
                >
                  {amt}
                </button>
              );
            })}
          </div>
        </section>

        {/* Clinical Flags */}
        <section className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Clinical Flags
          </h2>
          <div className="grid grid-cols-2 gap-4">
            {[
              {
                key: "incontinence" as const,
                label: "Incontinence",
                active: "bg-amber-500 border-amber-500 text-white shadow-amber-500/25",
                inactive: "hover:border-amber-500/50",
                testId: "btn-flag-incontinence",
              },
              {
                key: "blood" as const,
                label: "Blood Present",
                active: "bg-red-600 border-red-600 text-white shadow-red-600/30",
                inactive: "hover:border-red-600/50",
                testId: "btn-flag-blood",
              },
              {
                key: "mucus" as const,
                label: "Mucus Present",
                active: "bg-yellow-500 border-yellow-500 text-white shadow-yellow-500/25",
                inactive: "hover:border-yellow-500/50",
                testId: "btn-flag-mucus",
              },
              {
                key: "pain" as const,
                label: "Pain / Straining",
                active: "bg-purple-500 border-purple-500 text-white shadow-purple-500/25",
                inactive: "hover:border-purple-500/50",
                testId: "btn-flag-pain",
              },
            ].map((flag) => (
              <button
                key={flag.key}
                onClick={() => setFlags((f) => ({ ...f, [flag.key]: !f[flag.key] }))}
                data-testid={flag.testId}
                className={[
                  "min-h-[88px] rounded-xl font-bold text-xl border-2 transition-all duration-150 shadow-lg focus:outline-none",
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

        {/* Live Clinical Note */}
        <section className="space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Generated Clinical Note
          </h2>
          <div className="bg-card border-2 border-border rounded-xl p-6 min-h-[100px] flex items-center shadow-inner">
            <p
              className="font-mono text-lg text-foreground leading-relaxed break-words w-full"
              data-testid="text-clinical-note"
            >
              {getClinicalNote()}
            </p>
          </div>
        </section>
      </main>

      {/* Sticky Bottom Action Bar */}
      <footer className="fixed bottom-0 left-0 right-0 bg-card border-t border-border px-6 py-5 shadow-[0_-8px_24px_rgba(0,0,0,0.25)] z-50">
        <div className="max-w-7xl mx-auto flex gap-4">
          <button
            onClick={handleReset}
            data-testid="btn-reset"
            className="w-[28%] min-h-[80px] rounded-xl font-bold text-lg border-2 border-muted-foreground/50 text-muted-foreground hover:bg-muted transition-colors uppercase tracking-widest"
          >
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={createBM.isPending}
            data-testid="btn-save"
            className="w-[72%] min-h-[80px] rounded-xl font-bold text-2xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all uppercase tracking-widest shadow-lg shadow-primary/30"
          >
            {createBM.isPending ? "Saving..." : "Copy to EMR & Save"}
          </button>
        </div>
      </footer>
    </div>
  );
}
