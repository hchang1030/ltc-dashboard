import { useState, useEffect } from "react";
import { Clock, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type StoolType = 1 | 2 | 3 | 4 | 5 | 6 | 7 | null;
type Amount = "Small" | "Medium" | "Large" | "XL" | null;

interface Flags {
  incontinence: boolean;
  blood: boolean;
  mucus: boolean;
  pain: boolean;
}

const STOOL_TYPES = [
  { id: 1, label: "Type 1", desc: "Separate hard lumps", color: "bg-[#2d1b11]", textColor: "text-white" },
  { id: 2, label: "Type 2", desc: "Lumpy sausage", color: "bg-[#3e2723]", textColor: "text-white" },
  { id: 3, label: "Type 3", desc: "Cracked surface", color: "bg-[#5d4037]", textColor: "text-white" },
  { id: 4, label: "Type 4", desc: "Smooth & soft", color: "bg-[#795548]", textColor: "text-white" },
  { id: 5, label: "Type 5", desc: "Soft blobs", color: "bg-[#bcaaa4]", textColor: "text-black" },
  { id: 6, label: "Type 6", desc: "Fluffy pieces", color: "bg-[#d7ccc8]", textColor: "text-black" },
  { id: 7, label: "Type 7", desc: "Entirely liquid", color: "bg-[#efebe9]", textColor: "text-black" },
] as const;

export default function BowelMovementLog() {
  const [time, setTime] = useState(new Date());
  const [stoolType, setStoolType] = useState<StoolType>(null);
  const [amount, setAmount] = useState<Amount>(null);
  const [flags, setFlags] = useState<Flags>({
    incontinence: false,
    blood: false,
    mucus: false,
    pain: false,
  });
  const { toast } = useToast();

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleReset = () => {
    setStoolType(null);
    setAmount(null);
    setFlags({ incontinence: false, blood: false, mucus: false, pain: false });
  };

  const getClinicalNote = () => {
    if (!stoolType && !amount && !Object.values(flags).some(Boolean)) {
      return "Awaiting documentation input...";
    }

    let note = "";
    
    if (stoolType && amount) {
      const typeDesc = STOOL_TYPES.find(t => t.id === stoolType)?.desc.toLowerCase();
      note += `${amount}, Type ${stoolType} bowel movement documented. ${typeDesc ? typeDesc.charAt(0).toUpperCase() + typeDesc.slice(1) : ""}. `;
    } else if (stoolType) {
      const typeDesc = STOOL_TYPES.find(t => t.id === stoolType)?.desc.toLowerCase();
      note += `Type ${stoolType} bowel movement documented. ${typeDesc ? typeDesc.charAt(0).toUpperCase() + typeDesc.slice(1) : ""}. `;
    } else if (amount) {
      note += `${amount} bowel movement documented. `;
    }

    if (flags.incontinence || (!flags.incontinence && (stoolType || amount))) {
        note += flags.incontinence ? "Incontinent. " : "Continent. ";
    }

    const additionalNotes = [];
    if (flags.blood) additionalNotes.push("Blood present");
    if (flags.mucus) additionalNotes.push("Mucus noted");
    if (flags.pain) additionalNotes.push("Pain/straining observed");

    if (additionalNotes.length > 0) {
      note += additionalNotes.join(". ") + ". ";
    } else if (stoolType || amount) {
      note += "No blood, mucus, or pain noted. ";
    }

    if (flags.blood) {
      note += "Clinical review recommended.";
    }

    return note.trim();
  };

  const handleSave = async () => {
    const note = getClinicalNote();
    if (note === "Awaiting documentation input...") return;
    
    try {
      await navigator.clipboard.writeText(note);
      toast({
        title: "Copied to clipboard and saved!",
        description: "The clinical note has been securely copied to your clipboard.",
      });
      handleReset();
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Please manually copy the text.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-32">
      {/* SECTION 1: Patient Header Bar */}
      <header className="sticky top-0 z-50 bg-card border-b border-border px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4 text-muted-foreground font-medium">
          <div className="bg-primary/20 p-2 rounded-full">
            <User className="w-6 h-6 text-primary" />
          </div>
          <div className="flex gap-4 items-center">
            <span className="text-foreground font-bold">Resident: John Smith</span>
            <span>|</span>
            <span>Room 202</span>
            <span>|</span>
            <span>DOB: 1941-03-15</span>
            <span>|</span>
            <span>MRN: 00192834</span>
          </div>
        </div>
        <div className="absolute left-1/2 -translate-x-1/2 font-bold text-xl tracking-tight">
          Bowel Movement Log
        </div>
        <div className="flex items-center gap-6">
          <div className="bg-blue-500/10 text-blue-400 px-3 py-1 rounded-full text-sm font-bold uppercase tracking-wider border border-blue-500/20">
            Care Aide Mode
          </div>
          <div className="flex items-center gap-2 font-mono text-xl tabular-nums">
            <Clock className="w-5 h-5" />
            {time.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-8 space-y-12">
        {/* SECTION 2: Bristol Stool Scale */}
        <section className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Stool Type (Bristol Scale)</h2>
          <div className="grid grid-cols-7 gap-4">
            {STOOL_TYPES.map((type) => {
              const isSelected = stoolType === type.id;
              return (
                <button
                  key={type.id}
                  onClick={() => setStoolType(type.id as StoolType)}
                  data-testid={`btn-stool-type-${type.id}`}
                  className={[
                    "flex flex-col items-center justify-center p-4 min-h-[140px] rounded-xl border-4 transition-all duration-200",
                    isSelected
                      ? "border-primary bg-card scale-105 shadow-xl shadow-primary/20"
                      : "border-transparent bg-card hover:border-primary/50"
                  ].join(" ")}
                >
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-3 text-2xl font-bold shadow-inner ${type.color} ${type.textColor}`}>
                    {type.id}
                  </div>
                  <div className="text-center font-medium leading-tight">
                    {type.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* SECTION 3: Amount Selection */}
        <section className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Amount</h2>
          <div className="grid grid-cols-4 gap-4">
            {(["Small", "Medium", "Large", "XL"] as const).map((amt) => {
              const isSelected = amount === amt;
              return (
                <button
                  key={amt}
                  onClick={() => setAmount(amt)}
                  data-testid={`btn-amount-${amt.toLowerCase()}`}
                  className={`
                    min-h-[80px] rounded-xl font-bold text-xl border-2 transition-all duration-200
                    ${isSelected 
                      ? 'bg-primary border-primary text-primary-foreground shadow-lg' 
                      : 'bg-card border-border text-foreground hover:border-primary/50'
                    }
                  `}
                >
                  {amt}
                </button>
              );
            })}
          </div>
        </section>

        {/* SECTION 4: Clinical Flags */}
        <section className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Clinical Flags</h2>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setFlags(f => ({ ...f, incontinence: !f.incontinence }))}
              data-testid="btn-flag-incontinence"
              className={`
                min-h-[80px] rounded-xl font-bold text-xl border-2 transition-all duration-200
                ${flags.incontinence
                  ? 'bg-amber-500 border-amber-500 text-white shadow-lg shadow-amber-500/20'
                  : 'bg-card border-border text-foreground hover:border-amber-500/50'
                }
              `}
            >
              Incontinence
            </button>
            <button
              onClick={() => setFlags(f => ({ ...f, blood: !f.blood }))}
              data-testid="btn-flag-blood"
              className={`
                min-h-[80px] rounded-xl font-bold text-xl border-2 transition-all duration-200
                ${flags.blood
                  ? 'bg-red-600 border-red-600 text-white shadow-lg shadow-red-600/30'
                  : 'bg-card border-border text-foreground hover:border-red-600/50'
                }
              `}
            >
              Blood Present
            </button>
            <button
              onClick={() => setFlags(f => ({ ...f, mucus: !f.mucus }))}
              data-testid="btn-flag-mucus"
              className={`
                min-h-[80px] rounded-xl font-bold text-xl border-2 transition-all duration-200
                ${flags.mucus
                  ? 'bg-yellow-500 border-yellow-500 text-white shadow-lg shadow-yellow-500/20'
                  : 'bg-card border-border text-foreground hover:border-yellow-500/50'
                }
              `}
            >
              Mucus Present
            </button>
            <button
              onClick={() => setFlags(f => ({ ...f, pain: !f.pain }))}
              data-testid="btn-flag-pain"
              className={`
                min-h-[80px] rounded-xl font-bold text-xl border-2 transition-all duration-200
                ${flags.pain
                  ? 'bg-purple-500 border-purple-500 text-white shadow-lg shadow-purple-500/20'
                  : 'bg-card border-border text-foreground hover:border-purple-500/50'
                }
              `}
            >
              Pain / Straining
            </button>
          </div>
        </section>

        {/* SECTION 5: Live Clinical Note */}
        <section className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Generated Clinical Note</h2>
          <div className="bg-card border-2 border-border rounded-xl p-6 min-h-[120px] flex items-center shadow-inner">
            <p className="font-mono text-xl text-foreground leading-relaxed break-words w-full" data-testid="text-clinical-note">
              {getClinicalNote()}
            </p>
          </div>
        </section>
      </main>

      {/* SECTION 6: Bottom Action Bar */}
      <footer className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-6 shadow-[0_-10px_30px_rgba(0,0,0,0.2)] z-50">
        <div className="max-w-7xl mx-auto flex gap-6">
          <button
            onClick={handleReset}
            data-testid="btn-reset"
            className="w-[30%] min-h-[80px] rounded-xl font-bold text-xl border-2 border-muted-foreground text-muted-foreground hover:bg-muted transition-colors uppercase tracking-wider"
          >
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={!stoolType && !amount && !Object.values(flags).some(Boolean)}
            data-testid="btn-save"
            className="w-[70%] min-h-[80px] rounded-xl font-bold text-2xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all uppercase tracking-wider shadow-lg"
          >
            Copy to EMR & Save
          </button>
        </div>
      </footer>
    </div>
  );
}