import {
  useGetPhysicianSummary,
  getGetPhysicianSummaryQueryKey,
  useListBowelMovements,
  useListBinderEntries,
  useResolveBinderEntry,
  useUndoBinderEntry,
  getListBinderEntriesQueryKey,
  useListContactDirectory,
  useCreateContactEntry,
  useUpdateContactEntry,
  useDeleteContactEntry,
  useSendCommunication,
  useListCommunications,
  getListContactDirectoryQueryKey,
  getListCommunicationsQueryKey,
  useListResidents,
  getListResidentsQueryKey,
  useListOrderTemplates,
  useSignResidentOrder,
  useListResidentOrders,
  useUpdateOrderTemplate,
  getListOrderTemplatesQueryKey,
  getListResidentOrdersQueryKey,
  useUpdateResidentDemographics,
  useListMedicationTrackers,
  getListMedicationTrackersQueryKey,
} from "@workspace/api-client-react";
import type { ResidentAlertSummary, BinderEntry, ContactDirectoryEntry, CommunicationLog, OrderTemplate } from "@workspace/api-client-react";
import {
  Clock,
  RefreshCw,
  AlertTriangle,
  Droplets,
  CalendarX,
  X,
  ChevronRight,
  ChevronDown,
  Droplet,
  Activity,
  Megaphone,
  CheckCircle2,
  Undo2,
  Printer,
  Pencil,
  Trash2,
  Send,
  BookOpen,
  Plus,
  ArrowLeft,
  Mail,
  Smartphone,
  Star,
  FileText,
  ClipboardList,
  Stethoscope,
  Shield,
  AlertCircle,
  Phone,
  Save,
  UserCheck,
  Mic,
  Search,
  TrendingUp,
  TrendingDown,
  Minus,
  Video,
  VideoOff,
  PhoneOff,
  Users,
  MessageCircle,
  ExternalLink,
  Sparkles,
  ChevronUp,
  Check,
} from "lucide-react";
import { useState, useEffect, useCallback, useMemo, Fragment, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { PatientOverlay } from "@/components/PatientOverlay";
import {
  processNLQ, getQIMetrics, getFamilyQuestions, saveFamilyQuestions,
  getMockPRNLaxCount, getMockPRNAntipsychoticCount, getMockFalls,
} from "@/data/mockData";
import type { NLQResult, FamilyQuestion } from "@/data/mockData";

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

// ── AI Clinical Copilot ───────────────────────────────────────────────────────

type TriggerKey = "UTI" | "Fall" | "Agitation";

const TRIGGER_KEYWORDS: Record<TriggerKey, string[]> = {
  UTI:       ["uti", "urinary tract", "dysuria", "bacteriuria", "pyuria", "cystitis"],
  Fall:      ["fall", "fell", "fallen", "collapse", "slipped", "trip"],
  Agitation: ["agitat", "aggressiv", "combative", "restless", "behaviou", "behavior"],
};

interface ClinicalSuggestion {
  investigations: string[];
  evidence: { label: string; org: string }[];
  plan: string[];
  followUps: string[];
}

const CLINICAL_SUGGESTIONS: Record<TriggerKey, ClinicalSuggestion> = {
  UTI: {
    investigations: [
      "Urinalysis (UA) with microscopy",
      "Urine Culture & Sensitivity (C&S)",
      "CBC with differential",
      "BMP — renal function (Cr, BUN)",
    ],
    evidence: [
      { label: "Asymptomatic Bacteriuria in Older Adults",       org: "Choosing Wisely Canada" },
      { label: "UTI in Long-Term Care — Clinical Practice Guide", org: "AMDA" },
      { label: "Beers Criteria — Antibiotics in Older Adults",   org: "AGS 2023" },
    ],
    plan: [
      "Push oral fluids — target ≥ 1.5 L/day",
      "Monitor vitals q4h × 48h",
      "Hold antibiotic pending C&S if clinically stable",
      "Review current medications for nephrotoxicity",
      "Reassess in 24–48h; escalate if clinical deterioration",
    ],
    followUps: [
      "Recheck urinalysis in 48–72h",
      "Follow up on urine C&S sensitivities (Friday)",
      "Reassess antibiotic choice once C&S available",
      "Review fluid intake log at next round",
    ],
  },
  Fall: {
    investigations: [
      "Post-fall neurological assessment (GCS)",
      "X-ray hip, spine, or wrist if mechanism warrants",
      "Blood glucose stat",
      "Orthostatic blood pressure check",
    ],
    evidence: [
      { label: "Falls Prevention in Long-Term Care",              org: "Choosing Wisely Canada" },
      { label: "High-Fall-Risk Medications (Beers Criteria)",     org: "AGS 2023" },
      { label: "Falls in Older People — NG147",                  org: "NICE Guidelines" },
    ],
    plan: [
      "Document fall circumstances, witnesses, and mechanism",
      "Update Morse Fall Scale risk assessment",
      "Medication review — identify high-risk agents (benzos, diuretics, antipsychotics)",
      "Physiotherapy referral for gait and balance assessment",
      "Notify SDM/family; revise safety care plan",
    ],
    followUps: [
      "Physiotherapy assessment scheduled within 72h",
      "Medication review completed by next physician visit",
      "Updated care plan reviewed with SDM/family",
      "Post-fall incident report filed and reviewed",
    ],
  },
  Agitation: {
    investigations: [
      "Delirium screen — CAM assessment",
      "Urinalysis (rule out UTI as precipitant)",
      "Blood glucose and electrolytes",
      "Review medication changes in the last 7 days",
    ],
    evidence: [
      { label: "Managing Behavioural Symptoms in Dementia",      org: "CCSMH Guidelines" },
      { label: "Antipsychotics in Dementia — Deprescribing",     org: "Choosing Wisely Canada" },
      { label: "Beers Criteria — Antipsychotics in LTC",         org: "AGS 2023" },
    ],
    plan: [
      "Non-pharmacological first: music, familiar objects, reorientation",
      "Identify and address underlying triggers (pain, noise, unmet needs)",
      "Document PRN medication response and titration",
      "Consider geriatric psychiatry or P.I.E.C.E.S. consult",
      "Update behavioural care plan with triggers and effective strategies",
    ],
    followUps: [
      "Behavioural log review in 48h",
      "PRN medication efficacy assessment at next round",
      "Consider geriatric psychiatry referral if no improvement in 72h",
      "Nursing to document triggers and de-escalation strategies daily",
    ],
  },
};

function AIClinicalCopilot({ noteText, onApplyToNote }: {
  noteText: string;
  onApplyToNote: (text: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTrigger, setActiveTrigger] = useState<TriggerKey | null>(null);
  const [appliedTriggers, setAppliedTriggers] = useState<Set<TriggerKey>>(new Set());

  const detectedTriggers = useMemo<TriggerKey[]>(() => {
    const lower = noteText.toLowerCase();
    return (Object.keys(TRIGGER_KEYWORDS) as TriggerKey[]).filter((key) =>
      TRIGGER_KEYWORDS[key].some((kw) => lower.includes(kw)),
    );
  }, [noteText]);

  // Auto-expand when the trigger set first appears or a new trigger is added
  const triggersKey = detectedTriggers.join(",");
  useEffect(() => {
    if (detectedTriggers.length > 0) {
      setIsExpanded(true);
      setActiveTrigger((prev) =>
        prev && detectedTriggers.includes(prev) ? prev : detectedTriggers[0],
      );
    } else {
      setIsExpanded(false);
      setActiveTrigger(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggersKey]);

  const currentTrigger: TriggerKey | null =
    activeTrigger && detectedTriggers.includes(activeTrigger)
      ? activeTrigger
      : (detectedTriggers[0] ?? null);

  const suggestion = currentTrigger ? CLINICAL_SUGGESTIONS[currentTrigger] : null;

  if (detectedTriggers.length === 0) return null;

  return (
    <div className="rounded-xl border border-blue-500/30 bg-blue-950/20 overflow-hidden">
      {/* Header / toggle */}
      <button
        onClick={() => setIsExpanded((p) => !p)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-blue-950/30 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
          <div className="text-left min-w-0">
            <p className="text-xs font-bold text-blue-300">AI Decision Aid — Clinical Copilot</p>
            <p className="text-[10px] text-blue-400/60 mt-0.5 truncate">
              Detected: {detectedTriggers.join(", ")}
            </p>
          </div>
        </div>
        {isExpanded
          ? <ChevronUp   className="w-4 h-4 text-blue-400/60 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-blue-400/60 shrink-0" />}
      </button>

      {isExpanded && suggestion && currentTrigger && (
        <div className="border-t border-blue-500/20 px-4 pt-3 pb-4 space-y-4">
          {/* Trigger tabs (when >1 trigger) */}
          {detectedTriggers.length > 1 && (
            <div className="flex gap-1.5">
              {detectedTriggers.map((t) => (
                <button
                  key={t}
                  onClick={(e) => { e.stopPropagation(); setActiveTrigger(t); }}
                  className={[
                    "px-3 py-1 rounded-lg text-xs font-bold border transition-all",
                    currentTrigger === t
                      ? "bg-blue-700/40 border-blue-400 text-blue-200"
                      : "border-blue-500/20 text-blue-400/60 hover:border-blue-400/40",
                  ].join(" ")}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          {/* 1 — Suggested Investigations */}
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-widest font-bold text-blue-300/70 flex items-center gap-1.5">
              <Search className="w-3 h-3" /> Suggested Investigations
            </p>
            <ul className="space-y-1.5">
              {suggestion.investigations.map((item) => (
                <li key={item} className="flex items-start gap-2 text-xs text-blue-100/80 leading-relaxed">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-[5px] shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* 2 — Evidence & Algorithms */}
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-widest font-bold text-blue-300/70 flex items-center gap-1.5">
              <BookOpen className="w-3 h-3" /> Evidence &amp; Algorithms
            </p>
            <ul className="space-y-1.5">
              {suggestion.evidence.map((e) => (
                <li key={e.label} className="flex items-start gap-2 text-xs leading-relaxed">
                  <ExternalLink className="w-3 h-3 text-blue-400 mt-[2px] shrink-0" />
                  <span>
                    <span className="text-blue-200 font-medium">{e.label}</span>
                    <span className="text-blue-400/50 ml-1.5">— {e.org}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* 3 — Suggested Plan */}
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-widest font-bold text-blue-300/70 flex items-center gap-1.5">
              <ClipboardList className="w-3 h-3" /> Suggested Plan
            </p>
            <ul className="space-y-1.5">
              {suggestion.plan.map((item) => (
                <li key={item} className="flex items-start gap-2 text-xs text-blue-100/80 leading-relaxed">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-[5px] shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <button
              onClick={() => {
                const planBlock = `\n\nSuggested Plan (${currentTrigger}):\n${suggestion.plan.map((p) => `• ${p}`).join("\n")}`;
                onApplyToNote(planBlock);
                setAppliedTriggers((p) => new Set([...p, currentTrigger]));
              }}
              disabled={appliedTriggers.has(currentTrigger)}
              className="mt-1 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-700/30 border border-blue-500/40 text-blue-200 text-xs font-bold hover:bg-blue-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {appliedTriggers.has(currentTrigger) ? (
                <><Check className="w-3.5 h-3.5 text-emerald-400" /> Applied to Note</>
              ) : (
                <><Plus className="w-3.5 h-3.5" /> Apply to Note</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── AI Follow-Up Tracker ──────────────────────────────────────────────────────

function AIFollowUpTracker({ noteText }: { noteText: string }) {
  const { toast } = useToast();
  const [checked, setChecked] = useState<Set<number>>(new Set());

  const detectedTriggers = useMemo<TriggerKey[]>(() => {
    const lower = noteText.toLowerCase();
    return (Object.keys(TRIGGER_KEYWORDS) as TriggerKey[]).filter((key) =>
      TRIGGER_KEYWORDS[key].some((kw) => lower.includes(kw)),
    );
  }, [noteText]);

  const followUps = useMemo<string[]>(() => {
    const items: string[] = [];
    detectedTriggers.forEach((t) => items.push(...CLINICAL_SUGGESTIONS[t].followUps));
    if (items.length === 0 && noteText.trim().length > 50) {
      items.push("Follow-up at next scheduled physician visit");
      items.push("Nursing to monitor and document daily progress");
      items.push("Reassess response to current interventions in 48–72h");
    }
    return items;
  }, [detectedTriggers, noteText]);

  // Reset checks when trigger set changes
  const triggersKey = detectedTriggers.join(",");
  useEffect(() => { setChecked(new Set()); }, [triggersKey]); // eslint-disable-line

  if (followUps.length === 0) return null;

  const toggle = (i: number) =>
    setChecked((p) => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n; });

  const handleAddToTaskList = () => {
    const pending = followUps.filter((_, i) => !checked.has(i));
    const count = pending.length;
    if (count === 0) { toast({ title: "All follow-ups already checked off." }); return; }
    navigator.clipboard.writeText(pending.map((f) => `[ ] ${f}`).join("\n")).catch(() => {});
    toast({
      title: `${count} follow-up${count !== 1 ? "s" : ""} added to Global Task List`,
      description: "Unchecked items copied to clipboard.",
    });
  };

  return (
    <div className="rounded-xl border border-violet-500/30 bg-violet-950/20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-violet-500/20">
        <FileText className="w-4 h-4 text-violet-400 shrink-0" />
        <div>
          <p className="text-xs font-bold text-violet-300">AI Smart Follow-Up Tracker</p>
          <p className="text-[10px] text-violet-400/60 mt-0.5">
            Extracted follow-ups — {followUps.length} item{followUps.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Checklist */}
      <div className="px-4 py-3 space-y-2.5">
        {followUps.map((item, i) => (
          <button
            key={item}
            onClick={() => toggle(i)}
            className="w-full flex items-start gap-3 text-left group"
          >
            <div
              className={[
                "mt-0.5 w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-all",
                checked.has(i)
                  ? "bg-violet-600 border-violet-400"
                  : "border-violet-500/40 bg-transparent group-hover:border-violet-400",
              ].join(" ")}
            >
              {checked.has(i) && <Check className="w-2.5 h-2.5 text-white" />}
            </div>
            <span
              className={[
                "text-xs leading-relaxed transition-colors pt-0.5",
                checked.has(i)
                  ? "line-through text-violet-400/40"
                  : "text-violet-100/80 group-hover:text-violet-100",
              ].join(" ")}
            >
              {item}
            </span>
          </button>
        ))}
      </div>

      {/* Footer action */}
      <div className="px-4 pb-3.5 pt-1">
        <button
          onClick={handleAddToTaskList}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-700/30 border border-violet-500/40 text-violet-200 text-xs font-bold hover:bg-violet-700/50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add to Global Task List
        </button>
      </div>
    </div>
  );
}

// ── Drill-down Panel ──────────────────────────────────────────────────────────

interface DrillPanelProps {
  resident: ResidentAlertSummary | null;
  onClose: () => void;
  onOpenOverlay?: () => void;
}

function TagInput({ tags, onAdd, onRemove, placeholder, inputValue, setInputValue }: {
  tags: string[]; onAdd: (v: string) => void; onRemove: (v: string) => void;
  placeholder: string; inputValue: string; setInputValue: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-muted border border-border text-foreground">
            {t}
            <button type="button" onClick={() => onRemove(t)} className="ml-0.5 hover:text-red-400 transition-colors"><X className="w-3 h-3" /></button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === ",") && inputValue.trim()) {
            e.preventDefault();
            onAdd(inputValue.trim());
            setInputValue("");
          }
        }}
        placeholder={placeholder}
        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  );
}

function DrillPanel({ resident, onClose, onOpenOverlay }: DrillPanelProps) {
  const isOpen = resident !== null;
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "notes">("overview");
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteText, setNoteText] = useState("");

  const [formCodeStatus, setFormCodeStatus] = useState("");
  const [formAllergies, setFormAllergies] = useState<string[]>([]);
  const [formInfectionFlags, setFormInfectionFlags] = useState<string[]>([]);
  const [formSdmName, setFormSdmName] = useState("");
  const [formSdmRelation, setFormSdmRelation] = useState("");
  const [formSdmPhone, setFormSdmPhone] = useState("");
  const [allergyInput, setAllergyInput] = useState("");
  const [flagInput, setFlagInput] = useState("");
  const [noteSearch, setNoteSearch] = useState("");
  const [noteTypeFilter, setNoteTypeFilter] = useState<"all" | "md" | "rn" | "allied">("all");

  const queryClient = useQueryClient();
  const { mutate: saveDemographics, isPending: isSaving } = useUpdateResidentDemographics();
  const taperResId = resident?.residentId ?? 0;
  const { data: allTapers = [] } = useListMedicationTrackers(
    { residentId: taperResId },
    { query: { enabled: isOpen, queryKey: getListMedicationTrackersQueryKey({ residentId: taperResId }) } },
  );
  const currentTapers = useMemo(
    () => allTapers.filter((t) => t.status === "Ordered" || t.status === "Active Taper"),
    [allTapers],
  );

  const openEdit = useCallback(() => {
    setFormCodeStatus(resident?.codeStatus ?? "");
    setFormAllergies(resident?.allergies ?? []);
    setFormInfectionFlags(resident?.infectionFlags ?? []);
    setFormSdmName(resident?.sdmName ?? "");
    setFormSdmRelation(resident?.sdmRelation ?? "");
    setFormSdmPhone(resident?.sdmPhone ?? "");
    setAllergyInput("");
    setFlagInput("");
    setIsEditing(true);
  }, [resident]);

  const handleSave = useCallback(() => {
    if (!resident) return;
    saveDemographics(
      {
        residentId: resident.residentId,
        data: {
          codeStatus: formCodeStatus || null,
          allergies: formAllergies,
          infectionFlags: formInfectionFlags,
          sdmName: formSdmName || null,
          sdmRelation: formSdmRelation || null,
          sdmPhone: formSdmPhone || null,
        },
      },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: getGetPhysicianSummaryQueryKey() });
          setIsEditing(false);
        },
      },
    );
  }, [resident, formCodeStatus, formAllergies, formInfectionFlags, formSdmName, formSdmRelation, formSdmPhone, saveDemographics, queryClient]);

  const mockNotes = useMemo(() => {
    if (!resident) return [];
    const firstName = resident.name.split(" ")[0];
    const now = Date.now();
    const pool: Array<{ id: string; dateTime: string; author: string; role: string; roleType: "md" | "rn" | "allied"; text: string }> = [
      {
        id: "a",
        dateTime: new Date(now - 1.5 * 3600000).toISOString(),
        author: "Dr. Sarah Chang",
        role: "Attending Physician",
        roleType: "md",
        text: `${firstName} seen on rounds. Alert and oriented ×3. Vitals stable. Appetite reported fair. Continue current medication regimen. Family meeting scheduled Thursday to discuss goals of care.`,
      },
      {
        id: "b",
        dateTime: new Date(now - 4 * 3600000).toISOString(),
        author: "Jane Kowalski RN",
        role: "Registered Nurse",
        roleType: "rn",
        text: `Resident reported mild lower back discomfort rated 3/10. Repositioned and applied heat pack per PRN order. Pain reassessed at 1/10 post-intervention. Resident resting comfortably.`,
      },
      {
        id: "c",
        dateTime: new Date(now - 22 * 3600000).toISOString(),
        author: "Dr. Raj Patel",
        role: "Consulting Geriatrician",
        roleType: "md",
        text: `Geriatric consult completed. Reviewed recent labs — Hgb 10.2, mildly low. Recommend dietary iron supplementation and recheck in 6 weeks. No acute concerns at this time.`,
      },
      {
        id: "d",
        dateTime: new Date(now - 26 * 3600000).toISOString(),
        author: "Maria Santos RN",
        role: "Charge Nurse",
        roleType: "rn",
        text: `Skin assessment completed during morning care. Small stage I pressure injury noted at coccyx. Wound protocol initiated. Repositioning schedule updated to q2h. Family notified.`,
      },
      {
        id: "e",
        dateTime: new Date(now - 48 * 3600000).toISOString(),
        author: "Dr. Sarah Chang",
        role: "Attending Physician",
        roleType: "md",
        text: `Family meeting conducted re: ${firstName}'s prognosis and POLST form. SDM and two siblings present. DNR/DNH status confirmed. All questions addressed. Documentation updated in chart.`,
      },
      {
        id: "f",
        dateTime: new Date(now - 72 * 3600000).toISOString(),
        author: "Tom Bradley OT",
        role: "Occupational Therapist",
        roleType: "allied",
        text: `Functional mobility assessment completed. ${firstName} requires moderate assist for bed-to-chair transfers. New transfer belt ordered. Staff education on safe technique completed.`,
      },
    ];
    const offset = resident.residentId % pool.length;
    return [...pool.slice(offset), ...pool.slice(0, offset)];
  }, [resident]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showNoteModal) { setShowNoteModal(false); return; }
        if (isEditing) { setIsEditing(false); return; }
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, isEditing, showNoteModal]);

  useEffect(() => {
    if (!isOpen) { setIsEditing(false); setActiveTab("overview"); setShowNoteModal(false); }
  }, [isOpen]);

  const isRed   = resident?.alertLevel === "red";
  const isAmber = resident?.alertLevel === "amber";
  const nameCls = isRed ? "text-red-400" : isAmber ? "text-amber-400" : "text-foreground";
  const hasAlerts = !!(resident?.codeStatus || resident?.allergies?.length || resident?.infectionFlags?.length);
  const photoUrl = resident
    ? `https://i.pravatar.cc/120?img=${((resident.residentId - 6) % 70) + 1}`
    : "";

  const formatRelative = (iso: string) => {
    const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
    if (h < 1) return "Just now";
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  const formatNoteTime = (iso: string) =>
    new Date(iso).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={[
          "fixed inset-0 z-[65] bg-black/50 transition-opacity duration-300",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        ].join(" ")}
        data-testid="drill-backdrop"
      />

      {/* Side panel */}
      <aside
        data-testid="drill-panel"
        className={[
          "fixed top-0 right-0 h-full w-[580px] max-w-full bg-card border-l border-border z-[70]",
          "flex flex-col shadow-2xl transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        {/* Panel header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-4">
            {/* Square resident photo */}
            <div className="w-[72px] h-[72px] rounded-xl overflow-hidden shrink-0 border border-border bg-muted">
              {resident && (
                <img
                  src={photoUrl}
                  alt={resident.name}
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            <div>
              <h2 className={["text-xl font-bold leading-tight", nameCls].join(" ")}>
                {resident?.name ?? "—"}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">Room {resident?.room}</p>
              {resident && (
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5">
                  {resident.phn && (
                    <span className="text-xs text-muted-foreground">
                      <span className="font-semibold text-muted-foreground/60 uppercase tracking-wider text-[10px]">PHN </span>
                      <span className="font-mono">{resident.phn}</span>
                    </span>
                  )}
                  {resident.dob && (
                    <span className="text-xs text-muted-foreground">
                      <span className="font-semibold text-muted-foreground/60 uppercase tracking-wider text-[10px]">DOB </span>
                      <span className="font-mono">{String(resident.dob).slice(0, 10)}</span>
                      <span className="ml-1 text-muted-foreground/50">
                        ({(() => {
                          const d = new Date(String(resident.dob));
                          const today = new Date();
                          const age = today.getFullYear() - d.getFullYear() -
                            (today < new Date(today.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0);
                          return `${age}y`;
                        })()})
                      </span>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 mt-1">
            {!isEditing && onOpenOverlay && (
              <button
                onClick={onOpenOverlay}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary transition-colors text-xs font-bold"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Full Record
              </button>
            )}
            {!isEditing && (
              <button
                onClick={() => { setNoteText(""); setShowNoteModal(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors text-xs font-bold"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Note
              </button>
            )}
            {!isEditing && (
              <button
                onClick={openEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-xs font-medium"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </button>
            )}
            <button
              onClick={onClose}
              data-testid="btn-drill-close"
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab bar */}
        {!isEditing && (
          <div className="flex shrink-0 border-b border-border">
            {(["overview", "notes"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={[
                  "flex-1 py-3.5 text-sm font-semibold transition-colors border-b-2",
                  activeTab === tab
                    ? "text-primary border-primary bg-primary/5"
                    : "text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/40",
                ].join(" ")}
              >
                {tab === "overview" ? "Overview" : "Notes"}
              </button>
            ))}
          </div>
        )}

        {/* ── Edit form ─────────────────────────────────────── */}
        {isEditing ? (
          <div className="flex-1 overflow-y-auto">
            <div className="px-6 py-5 space-y-6">
              <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground/60">Editing Demographics — {resident?.name}</p>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-purple-400" /> Code Status
                </label>
                <input
                  type="text"
                  value={formCodeStatus}
                  onChange={(e) => setFormCodeStatus(e.target.value)}
                  placeholder="e.g. DNR M1-M4 C1, C2 · Full Code · CPR"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-red-400" /> Allergies
                </label>
                <TagInput
                  tags={formAllergies}
                  onAdd={(v) => setFormAllergies((p) => [...p, v])}
                  onRemove={(v) => setFormAllergies((p) => p.filter((x) => x !== v))}
                  placeholder="Type allergy and press Enter (e.g. Penicillin)"
                  inputValue={allergyInput}
                  setInputValue={setAllergyInput}
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> Infection Control Flags
                </label>
                <TagInput
                  tags={formInfectionFlags}
                  onAdd={(v) => setFormInfectionFlags((p) => [...p, v])}
                  onRemove={(v) => setFormInfectionFlags((p) => p.filter((x) => x !== v))}
                  placeholder="Type flag and press Enter (e.g. MRSA, VRE, C.diff)"
                  inputValue={flagInput}
                  setInputValue={setFlagInput}
                />
              </div>

              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-primary" /> Substitute Decision Maker
                </label>
                <input
                  type="text"
                  value={formSdmName}
                  onChange={(e) => setFormSdmName(e.target.value)}
                  placeholder="Full name"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <input
                  type="text"
                  value={formSdmRelation}
                  onChange={(e) => setFormSdmRelation(e.target.value)}
                  placeholder="Relationship (e.g. Daughter, Son, Spouse)"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <input
                  type="tel"
                  value={formSdmPhone}
                  onChange={(e) => setFormSdmPhone(e.target.value)}
                  placeholder="Phone number"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            <div className="sticky bottom-0 border-t border-border bg-card px-6 py-4 flex gap-3">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {isSaving ? "Saving…" : "Save Changes"}
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="px-5 py-3 rounded-xl border border-border text-muted-foreground hover:bg-muted transition-colors text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>

        ) : activeTab === "overview" ? (
          /* ── Overview Tab ─────────────────────────────────── */
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {hasAlerts && (
              <section className="space-y-3">
                <h3 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/60">Clinical Flags</h3>
                <div className="flex flex-wrap gap-2">
                  {resident?.codeStatus && (
                    <span className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-purple-900/40 text-purple-300 border border-purple-500/40 uppercase tracking-wide">
                      <Shield className="w-3.5 h-3.5 shrink-0" />
                      {resident.codeStatus}
                    </span>
                  )}
                  {resident?.allergies?.map((a) => (
                    <span key={a} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-red-900/40 text-red-300 border border-red-500/40 uppercase tracking-wide">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      ALLERGY: {a}
                    </span>
                  ))}
                  {resident?.infectionFlags?.map((f) => (
                    <span key={f} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-900/40 text-amber-300 border border-amber-500/40 uppercase tracking-wide">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      ISOLATION: {f}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {resident?.sdmName && (
              <section className="space-y-3">
                <h3 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/60 flex items-center gap-1.5">
                  <UserCheck className="w-3 h-3" /> Substitute Decision Maker
                </h3>
                <div className="rounded-xl border border-border bg-background/50 p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-foreground">{resident.sdmName}</p>
                    {resident.sdmRelation && <p className="text-xs text-muted-foreground mt-0.5">{resident.sdmRelation}</p>}
                  </div>
                  {resident.sdmPhone && (
                    <a
                      href={`tel:${resident.sdmPhone}`}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-mono text-sm font-semibold shrink-0"
                    >
                      <Phone className="w-4 h-4" />
                      {resident.sdmPhone}
                    </a>
                  )}
                </div>
              </section>
            )}

            {!hasAlerts && !resident?.sdmName && (
              <p className="text-xs text-muted-foreground/50 italic">No code status, allergies, or SDM on file. Click Edit to add.</p>
            )}

            {/* ── Care Continuity Tracker ────────────────────────── */}
            {resident && (() => {
              const falls = getMockFalls(resident.residentId);
              const prnLax = getMockPRNLaxCount(resident.residentId);
              const prnAP = getMockPRNAntipsychoticCount(resident.residentId);
              const bmGap48h = resident.hoursSinceLastBM !== null && resident.hoursSinceLastBM >= 48;
              const monthlyGaps = resident.monthlyGapCount;
              return (
                <section className="space-y-2.5">
                  <h3 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/60 flex items-center gap-1.5">
                    <ClipboardList className="w-3 h-3" /> Care Continuity Tracker
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <div className={["rounded-xl border px-3 py-2.5 flex items-center gap-2.5", falls.length > 0 ? "bg-red-950/40 border-red-500/40" : "bg-background/50 border-border"].join(" ")}>
                      <span className="text-base leading-none">⚠️</span>
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70">Falls (1yr)</p>
                        <p className={["text-sm font-bold leading-tight", falls.length > 0 ? "text-red-400" : "text-emerald-400"].join(" ")}>
                          {falls.length > 0 ? `${falls.length} event${falls.length !== 1 ? "s" : ""}` : "None recorded"}
                        </p>
                      </div>
                    </div>
                    <div className={["rounded-xl border px-3 py-2.5 flex items-center gap-2.5", bmGap48h ? "bg-amber-950/40 border-amber-500/40" : monthlyGaps > 0 ? "bg-amber-950/20 border-amber-500/20" : "bg-background/50 border-border"].join(" ")}>
                      <span className="text-base leading-none">💩</span>
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70">BM 48h+ Gaps</p>
                        <p className={["text-sm font-bold leading-tight", bmGap48h ? "text-amber-400" : monthlyGaps > 0 ? "text-amber-300/70" : "text-emerald-400"].join(" ")}>
                          {bmGap48h ? `Active · ${monthlyGaps} this mo.` : monthlyGaps > 0 ? `${monthlyGaps} this mo.` : "None this mo."}
                        </p>
                      </div>
                    </div>
                    <div className={["rounded-xl border px-3 py-2.5 flex items-center gap-2.5", prnLax > 2 ? "bg-orange-950/40 border-orange-500/40" : prnLax > 0 ? "bg-orange-950/20 border-orange-500/20" : "bg-background/50 border-border"].join(" ")}>
                      <span className="text-base leading-none">💊</span>
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70">PRN Lax (14d)</p>
                        <p className={["text-sm font-bold leading-tight", prnLax > 2 ? "text-orange-400" : prnLax > 0 ? "text-orange-300/80" : "text-emerald-400"].join(" ")}>
                          {prnLax > 0 ? `${prnLax} dose${prnLax !== 1 ? "s" : ""}` : "None"}
                        </p>
                      </div>
                    </div>
                    <div className={["rounded-xl border px-3 py-2.5 flex items-center gap-2.5", prnAP > 0 ? "bg-purple-950/40 border-purple-500/40" : "bg-background/50 border-border"].join(" ")}>
                      <span className="text-base leading-none">🧠</span>
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70">PRN Antipsych (14d)</p>
                        <p className={["text-sm font-bold leading-tight", prnAP > 0 ? "text-purple-400" : "text-emerald-400"].join(" ")}>
                          {prnAP > 0 ? `${prnAP} dose${prnAP !== 1 ? "s" : ""}` : "None"}
                        </p>
                      </div>
                    </div>
                  </div>
                </section>
              );
            })()}

            {/* ── Active Tapers ──────────────────────────────────── */}
            {resident && currentTapers.length > 0 && (
              <section className="space-y-2.5">
                <h3 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/60 flex items-center gap-1.5">
                  💊 Active Tapers
                </h3>
                <div className="space-y-2">
                  {currentTapers.map((taper) => (
                    <div key={taper.id} className={["rounded-xl border px-3 py-2.5", taper.status === "Active Taper" ? "bg-green-950/30 border-green-700/40" : "bg-indigo-950/30 border-indigo-700/40"].join(" ")}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground">{taper.medicationName}</p>
                        <span className={["text-xs font-bold px-2 py-0.5 rounded-full border", taper.status === "Active Taper" ? "bg-green-900/60 text-green-300 border-green-700/50" : "bg-indigo-900/60 text-indigo-300 border-indigo-700/50"].join(" ")}>
                          {taper.status === "Active Taper" ? "✓ Active" : "Awaiting Start"}
                        </span>
                      </div>
                      {taper.dosageInstructions && <p className="text-xs text-muted-foreground mt-1">{taper.dosageInstructions}</p>}
                      {taper.startDate && (
                        <p className="text-xs text-muted-foreground/60 mt-0.5">
                          Started: {new Date(taper.startDate).toLocaleDateString()}{taper.reviewDueDate && ` · Review: ${new Date(taper.reviewDueDate).toLocaleDateString()}`}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── CPOE — Full Order Entry ─────────────────────────── */}
            {resident && (
              <section className="space-y-3 pb-2">
                <h3 className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/60 flex items-center gap-1.5">
                  <Stethoscope className="w-3 h-3" /> CPOE — Order Entry
                </h3>
                <OrderHub
                  lockedResident={{ id: resident.residentId, name: resident.name, room: resident.room ?? "" }}
                  compact
                />
              </section>
            )}
          </div>

        ) : (
          /* ── Notes Tab ────────────────────────────────────── */
          <>
            <div className="px-5 pt-4 pb-2 space-y-2 shrink-0 border-b border-border/50">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  value={noteSearch}
                  onChange={(e) => setNoteSearch(e.target.value)}
                  placeholder="Search notes by author or content..."
                  className="w-full bg-muted/30 border border-border rounded-lg pl-8 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex gap-1.5 pb-1">
                {(["all", "md", "rn", "allied"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setNoteTypeFilter(type)}
                    className={["px-2.5 py-1 rounded-lg text-xs font-bold border transition-all", noteTypeFilter === type ? "bg-primary/15 border-primary text-primary" : "border-border text-muted-foreground hover:border-primary/40"].join(" ")}
                  >
                    {type === "all" ? "All" : type === "md" ? "MD" : type === "rn" ? "RN" : "Allied Health"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {mockNotes.filter((n) => {
                const matchType = noteTypeFilter === "all" || n.roleType === noteTypeFilter;
                const q = noteSearch.trim().toLowerCase();
                const matchSearch = !q || n.text.toLowerCase().includes(q) || n.author.toLowerCase().includes(q) || n.role.toLowerCase().includes(q);
                return matchType && matchSearch;
              }).map((note) => (
                <div
                  key={note.id}
                  className={[
                    "rounded-xl p-4 space-y-2.5 bg-background/60 border border-border/40 border-l-[3px]",
                    note.roleType === "md" ? "border-l-blue-500"
                      : note.roleType === "rn" ? "border-l-emerald-500"
                      : "border-l-violet-400",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground leading-tight">{note.author}</p>
                      <p className={[
                        "text-xs font-medium mt-0.5",
                        note.roleType === "md" ? "text-blue-400"
                          : note.roleType === "rn" ? "text-emerald-400"
                          : "text-violet-400",
                      ].join(" ")}>
                        {note.role}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-mono text-muted-foreground">{formatNoteTime(note.dateTime)}</p>
                      <p className="text-[10px] text-muted-foreground/50 mt-0.5">{formatRelative(note.dateTime)}</p>
                    </div>
                  </div>
                  <p className="text-sm text-foreground/80 leading-relaxed">{note.text}</p>
                </div>
              ))}
            </div>

            <div className="px-6 py-4 border-t border-border shrink-0">
              <button
                onClick={() => { setNoteText(""); setShowNoteModal(true); }}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Note
              </button>
            </div>
          </>
        )}
      </aside>

      {/* ── New Note Modal ────────────────────────────────────── */}
      {showNoteModal && (
        <>
          <div
            className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm"
            onClick={() => setShowNoteModal(false)}
          />
          <div className="fixed inset-x-4 top-[4vh] bottom-[4vh] z-[90] max-w-2xl mx-auto bg-card rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-border">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <div>
                <h2 className="text-lg font-bold text-foreground">New Clinical Note</h2>
                {resident && (
                  <p className="text-xs text-muted-foreground mt-0.5">{resident.name} · Room {resident.room}</p>
                )}
              </div>
              <button
                onClick={() => setShowNoteModal(false)}
                className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-4 border-b border-border shrink-0">
              <button className="w-full flex items-center justify-center gap-3 py-4 rounded-xl border-2 border-dashed border-primary/40 text-primary hover:bg-primary/5 transition-colors font-semibold text-sm">
                <Mic className="w-5 h-5" />
                🎙️ Voice Dictation (AI) — Coming Soon
              </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="px-6 pt-4 pb-3">
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder={"Begin typing your clinical note here…\n\nInclude: assessment findings, interventions, resident response, and plan."}
                  autoFocus
                  rows={8}
                  className="w-full resize-none bg-transparent text-foreground text-sm leading-relaxed focus:outline-none placeholder:text-muted-foreground"
                />
              </div>
              <div className="px-6 pb-5 space-y-3">
                <AIClinicalCopilot
                  noteText={noteText}
                  onApplyToNote={(text) =>
                    setNoteText((p) => p + (p && !p.endsWith("\n") ? "\n" : "") + text)
                  }
                />
                <AIFollowUpTracker noteText={noteText} />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-border shrink-0 flex gap-3">
              <button
                onClick={() => { setShowNoteModal(false); setNoteText(""); }}
                disabled={!noteText.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" />
                Save & Sign Note
              </button>
              <button
                onClick={() => setShowNoteModal(false)}
                className="px-6 py-3.5 rounded-xl border border-border text-muted-foreground hover:bg-muted transition-colors text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ── Comm Hub ─────────────────────────────────────────────────────────────────

type CommMethod = "Fax" | "Email" | "SMS";

function MethodIcon({ method, className }: { method: CommMethod; className?: string }) {
  const cls = className ?? "w-4 h-4";
  if (method === "Fax") return <Printer className={cls} />;
  if (method === "Email") return <Mail className={cls} />;
  return <Smartphone className={cls} />;
}

export function CommHubView() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ── Composer state ──
  const [selectedResidentId, setSelectedResidentId] = useState<number | null>(null);
  const [method, setMethod] = useState<CommMethod>("Fax");
  const [selectedContactId, setSelectedContactId] = useState<number | "custom" | null>(null);
  const [customValue, setCustomValue] = useState("");
  const [note, setNote] = useState("");
  const [noteFormat, setNoteFormat] = useState<"free" | "sbar">("free");
  const [sbarS, setSbarS] = useState("");
  const [sbarB, setSbarB] = useState("");
  const [sbarA, setSbarA] = useState("");
  const [sbarR, setSbarR] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  // ── Contact CRUD state ──
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editValue, setEditValue] = useState("");
  const [editType, setEditType] = useState<CommMethod>("Fax");
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newType, setNewType] = useState<CommMethod>("Fax");

  // ── Data ──
  const { data: residents = [] } = useListResidents({ query: { queryKey: getListResidentsQueryKey() } });
  const { data: contacts = [], isLoading: contactsLoading } = useListContactDirectory({
    query: { queryKey: getListContactDirectoryQueryKey() },
  });
  const { data: commsHistory = [], isLoading: historyLoading } = useListCommunications(
    {},
    { query: { queryKey: getListCommunicationsQueryKey() } },
  );

  const createEntry = useCreateContactEntry();
  const updateEntry = useUpdateContactEntry();
  const deleteEntry = useDeleteContactEntry();
  const sendComm = useSendCommunication();

  const invalidateContacts = () =>
    queryClient.invalidateQueries({ queryKey: getListContactDirectoryQueryKey() });
  const invalidateHistory = () =>
    queryClient.invalidateQueries({ queryKey: getListCommunicationsQueryKey() });

  // ── Derived ──
  const filteredContacts = contacts.filter((c) => c.contactType === method);
  const selectedContact =
    typeof selectedContactId === "number" ? contacts.find((c) => c.id === selectedContactId) : null;
  const contactValue = selectedContact ? selectedContact.contactValue : customValue;
  const destinationLabel = selectedContact ? selectedContact.labelName : "Custom";
  const selectedResident = residents.find((r) => r.id === selectedResidentId);
  const canGenerate =
    !!selectedResidentId &&
    note.trim().length > 0 &&
    (selectedContact != null || customValue.trim().length > 0);

  // Reset contact when method changes
  useEffect(() => {
    setSelectedContactId(null);
  }, [method]);

  // Auto-assemble SBAR fields into note string
  useEffect(() => {
    if (noteFormat !== "sbar") return;
    const parts: string[] = [];
    if (sbarS.trim()) parts.push(`S: ${sbarS.trim()}`);
    if (sbarB.trim()) parts.push(`B: ${sbarB.trim()}`);
    if (sbarA.trim()) parts.push(`A: ${sbarA.trim()}`);
    if (sbarR.trim()) parts.push(`R: ${sbarR.trim()}`);
    setNote(parts.join("\n"));
  }, [sbarS, sbarB, sbarA, sbarR, noteFormat]);

  // ── Prefill from contact click ──
  const prefill = (entry: ContactDirectoryEntry) => {
    setMethod(entry.contactType as CommMethod);
    setSelectedContactId(entry.id);
  };

  // ── Send ──
  const handleSend = () => {
    if (!selectedResidentId) return;
    sendComm.mutate(
      {
        data: {
          residentId: selectedResidentId,
          destinationLabel,
          contactValue,
          method,
          noteContent: note,
        },
      },
      {
        onSuccess: () => {
          navigator.clipboard.writeText(note).catch(() => {});
          toast({ title: "Sent & Note Copied to Clipboard" });
          invalidateHistory();
          setShowPreview(false);
          setNote("");
          setSelectedContactId(null);
          setCustomValue("");
        },
        onError: () => toast({ title: "Send failed", variant: "destructive" }),
      },
    );
  };

  // ── CRUD handlers ──
  const handleAddContact = () => {
    if (!newLabel.trim() || !newValue.trim()) return;
    createEntry.mutate(
      { data: { labelName: newLabel.trim(), contactValue: newValue.trim(), contactType: newType } },
      {
        onSuccess: () => {
          invalidateContacts();
          setAdding(false);
          setNewLabel("");
          setNewValue("");
          setNewType("Fax");
          toast({ title: "Contact added" });
        },
        onError: () => toast({ title: "Failed to add contact", variant: "destructive" }),
      },
    );
  };

  const handleUpdateContact = (id: number) => {
    if (!editLabel.trim() || !editValue.trim()) return;
    updateEntry.mutate(
      { entryId: id, data: { labelName: editLabel.trim(), contactValue: editValue.trim(), contactType: editType } },
      {
        onSuccess: () => {
          invalidateContacts();
          setEditingId(null);
          toast({ title: "Contact updated" });
        },
        onError: () => toast({ title: "Failed to update contact", variant: "destructive" }),
      },
    );
  };

  const handleDeleteContact = (id: number, label: string) => {
    deleteEntry.mutate(
      { entryId: id },
      {
        onSuccess: () => {
          invalidateContacts();
          if (selectedContactId === id) setSelectedContactId(null);
          toast({ title: `'${label}' removed` });
        },
        onError: () => toast({ title: "Failed to delete contact", variant: "destructive" }),
      },
    );
  };

  const startEdit = (entry: ContactDirectoryEntry) => {
    setEditingId(entry.id);
    setEditLabel(entry.labelName);
    setEditValue(entry.contactValue);
    setEditType(entry.contactType as CommMethod);
    setAdding(false);
  };

  const inputCls =
    "w-full bg-card border-2 border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60";

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const methodTabCls = (m: CommMethod) => {
    const active = method === m;
    const base =
      "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm border-2 transition-all";
    if (!active) return `${base} bg-card border-border text-muted-foreground hover:border-primary/40`;
    if (m === "Fax") return `${base} bg-sky-900/40 border-sky-500 text-sky-200`;
    if (m === "Email") return `${base} bg-violet-900/40 border-violet-500 text-violet-200`;
    return `${base} bg-emerald-900/40 border-emerald-600 text-emerald-200`;
  };

  const typeTabCls = (m: CommMethod, active: boolean) => {
    const base =
      "flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-bold border transition-all";
    return active
      ? `${base} bg-primary/20 border-primary/50 text-primary`
      : `${base} bg-card border-border text-muted-foreground`;
  };

  const iconColorCls = (m: string) =>
    m === "Fax" ? "text-sky-400" : m === "Email" ? "text-violet-400" : "text-emerald-400";
  const iconBgCls = (m: string) =>
    m === "Fax" ? "bg-sky-900/30" : m === "Email" ? "bg-violet-900/30" : "bg-emerald-900/30";
  const methodBadgeCls = (m: string) => {
    const base =
      "inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border";
    if (m === "Fax") return `${base} bg-sky-900/40 text-sky-300 border-sky-700/40`;
    if (m === "Email") return `${base} bg-violet-900/40 text-violet-300 border-violet-700/40`;
    return `${base} bg-emerald-900/40 text-emerald-300 border-emerald-700/40`;
  };

  return (
    <div className="space-y-6">
      {/* ── Top row: Composer + Contacts ── */}
      <div className="grid grid-cols-[1fr_360px] gap-6 items-start">

        {/* ── Composer card ── */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-muted/20 flex items-center gap-2">
            <Send className="w-4 h-4 text-primary" />
            <h2 className="font-bold text-sm text-foreground">Compose & Send</h2>
          </div>

          {!showPreview ? (
            <div className="p-5 space-y-5">

              {/* Resident picker */}
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Resident</p>
                <select
                  value={selectedResidentId ?? ""}
                  onChange={(e) =>
                    setSelectedResidentId(e.target.value ? parseInt(e.target.value) : null)
                  }
                  className="w-full bg-card border-2 border-border rounded-xl px-4 py-3 text-foreground focus:outline-none focus:border-primary/60 text-sm appearance-none"
                >
                  <option value="" className="bg-card">— Select resident —</option>
                  {residents.map((r) => (
                    <option key={r.id} value={r.id} className="bg-card">
                      {r.name} — Room {r.room}
                    </option>
                  ))}
                </select>
              </div>

              {/* Method selector */}
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Method</p>
                <div className="flex gap-2">
                  {(["Fax", "Email", "SMS"] as CommMethod[]).map((m) => (
                    <button key={m} onClick={() => setMethod(m)} className={methodTabCls(m)}>
                      <MethodIcon method={m} />
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Recipient */}
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Recipient
                  {filteredContacts.length > 0 && (
                    <span className="ml-2 normal-case font-normal text-muted-foreground/60">
                      — click a contact on the right to pre-fill
                    </span>
                  )}
                </p>
                <select
                  value={
                    selectedContactId === "custom"
                      ? "custom"
                      : selectedContactId !== null
                      ? String(selectedContactId)
                      : ""
                  }
                  onChange={(e) =>
                    setSelectedContactId(
                      e.target.value === "custom"
                        ? "custom"
                        : e.target.value
                        ? parseInt(e.target.value)
                        : null,
                    )
                  }
                  className="w-full bg-card border-2 border-border rounded-xl px-4 py-3 text-foreground focus:outline-none focus:border-primary/60 text-sm appearance-none"
                >
                  <option value="" className="bg-card">— Choose from contacts —</option>
                  {filteredContacts.map((c) => (
                    <option key={c.id} value={String(c.id)} className="bg-card">
                      {c.labelName} — {c.contactValue}
                    </option>
                  ))}
                  <option value="custom" className="bg-card">Custom…</option>
                </select>
              </div>

              {(selectedContactId === "custom" || selectedContactId === null) && (
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Custom{" "}
                    {method === "Fax"
                      ? "Fax Number"
                      : method === "Email"
                      ? "Email Address"
                      : "Phone Number"}
                  </p>
                  <div className="flex items-center gap-3 bg-card border-2 border-border rounded-xl px-4 py-3 focus-within:border-primary/60">
                    <MethodIcon method={method} className="w-4 h-4 text-muted-foreground shrink-0" />
                    <input
                      type="text"
                      value={customValue}
                      onChange={(e) => setCustomValue(e.target.value)}
                      placeholder={
                        method === "Fax"
                          ? "e.g. 1-800-555-0000"
                          : method === "Email"
                          ? "e.g. dr.jones@hospital.ca"
                          : "e.g. +1-604-555-1234"
                      }
                      className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none text-sm"
                    />
                  </div>
                </div>
              )}

              {/* Note */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Clinical Note</p>
                  <div className="flex items-center gap-0.5 bg-muted/40 rounded-lg p-0.5">
                    <button
                      onClick={() => setNoteFormat("free")}
                      className={["px-3 py-1 rounded-md text-xs font-bold transition-colors",
                        noteFormat === "free" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"].join(" ")}
                    >
                      Free text
                    </button>
                    <button
                      onClick={() => setNoteFormat("sbar")}
                      className={["px-3 py-1 rounded-md text-xs font-bold transition-colors",
                        noteFormat === "sbar" ? "bg-primary/20 text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"].join(" ")}
                    >
                      SBAR
                    </button>
                  </div>
                </div>
                {noteFormat === "free" ? (
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={7}
                    placeholder={`Enter the message to send via ${method.toLowerCase()}…`}
                    className="w-full bg-card border-2 border-border rounded-xl p-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 text-sm resize-none leading-relaxed"
                  />
                ) : (
                  <div className="space-y-2">
                    {[
                      { key: "S", label: "Situation", val: sbarS, set: setSbarS, placeholder: "What is happening right now with this resident?" },
                      { key: "B", label: "Background", val: sbarB, set: setSbarB, placeholder: "Relevant history, medications, recent events…" },
                      { key: "A", label: "Assessment", val: sbarA, set: setSbarA, placeholder: "Your clinical judgment of the situation…" },
                      { key: "R", label: "Recommendation", val: sbarR, set: setSbarR, placeholder: "What action is being requested or recommended?" },
                    ].map(({ key, label, val, set, placeholder }) => (
                      <div key={key} className="flex gap-2.5">
                        <div className="w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-[22px]">{key}</div>
                        <div className="flex-1 space-y-0.5">
                          <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70">{label}</p>
                          <textarea
                            value={val}
                            onChange={(e) => set(e.target.value)}
                            rows={2}
                            placeholder={placeholder}
                            className="w-full bg-card border-2 border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 resize-none leading-relaxed"
                          />
                        </div>
                      </div>
                    ))}
                    {note.trim() && (
                      <div className="bg-muted/20 border border-border/50 rounded-xl p-3">
                        <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/60 mb-1.5">Assembled Note</p>
                        <p className="text-xs font-mono text-foreground/70 whitespace-pre-wrap leading-relaxed">{note}</p>
                      </div>
                    )}
                  </div>
                )}
                <p className="text-xs text-muted-foreground text-right">{note.length} characters</p>
              </div>

              <button
                onClick={() => setShowPreview(true)}
                disabled={!canGenerate}
                className="w-full min-h-[56px] rounded-xl font-bold text-base border-2 border-primary bg-primary/20 text-primary hover:bg-primary/30 transition-all flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <MethodIcon method={method} className="w-5 h-5" />
                Generate Preview
              </button>
            </div>
          ) : (
            /* ── Preview ── */
            <div className="p-5 space-y-5">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {method} Preview
              </p>

              {method === "Fax" && (
                <div className="bg-white text-gray-900 rounded-xl border-2 border-border shadow-lg p-6 font-mono text-xs space-y-4">
                  <div className="text-center space-y-0.5 border-b-2 border-gray-900 pb-3">
                    <p className="font-bold text-base tracking-wide">FACSIMILE TRANSMISSION</p>
                    <p className="text-gray-600">Long-Term Care Facility — Confidential</p>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                    <span className="font-bold">TO:</span>   <span>{destinationLabel}</span>
                    <span className="font-bold">FAX:</span>  <span>{contactValue}</span>
                    <span className="font-bold">FROM:</span> <span>Attending Physician</span>
                    <span className="font-bold">DATE:</span> <span>{today}</span>
                  </div>
                  <div className="border-t border-gray-300" />
                  <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                    <span className="font-bold">PATIENT:</span>{" "}
                    <span className="font-bold">{selectedResident?.name ?? "—"}</span>
                    <span className="font-bold">ROOM:</span> <span>{selectedResident?.room ?? "—"}</span>
                  </div>
                  <div className="border-t border-gray-300" />
                  <div className="space-y-2">
                    <p className="font-bold uppercase tracking-wide">Clinical Note:</p>
                    <p className="whitespace-pre-wrap leading-relaxed text-gray-800">{note}</p>
                  </div>
                  <div className="border-t border-gray-200 pt-2 text-center text-gray-400">
                    <p>*** CONFIDENTIAL — FOR INTENDED RECIPIENT ONLY ***</p>
                  </div>
                </div>
              )}

              {method === "Email" && (
                <div className="bg-card border-2 border-border rounded-xl text-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-border bg-muted/30 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                    <span className="text-muted-foreground font-bold">To:</span>
                    <span className="text-foreground font-mono">{contactValue || "—"}</span>
                    <span className="text-muted-foreground font-bold">From:</span>
                    <span className="text-foreground">Attending Physician (LTC Facility)</span>
                    <span className="text-muted-foreground font-bold">Subject:</span>
                    <span className="text-foreground">
                      Patient Update — {selectedResident?.name ?? "—"}, Room{" "}
                      {selectedResident?.room ?? "—"}
                    </span>
                    <span className="text-muted-foreground font-bold">Date:</span>
                    <span className="text-muted-foreground">{today}</span>
                  </div>
                  <div className="px-4 py-4">
                    <p className="whitespace-pre-wrap text-foreground text-sm leading-relaxed">{note}</p>
                  </div>
                </div>
              )}

              {method === "SMS" && (
                <div className="bg-muted/20 border border-border rounded-xl p-4 space-y-2">
                  <p className="text-xs text-muted-foreground font-mono">To: {contactValue || "—"}</p>
                  <div className="bg-emerald-900/30 border border-emerald-700/40 rounded-2xl rounded-tl-none px-4 py-3 max-w-[80%]">
                    <p className="text-emerald-100 text-sm leading-relaxed whitespace-pre-wrap">{note}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Patient: {selectedResident?.name ?? "—"}, Room {selectedResident?.room ?? "—"}
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setShowPreview(false)}
                  className="flex-1 min-h-[52px] rounded-xl font-bold border-2 border-border text-muted-foreground hover:bg-muted transition-all flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={handleSend}
                  disabled={sendComm.isPending}
                  className="flex-[2] min-h-[52px] rounded-xl font-bold border-2 border-primary bg-primary/20 text-primary hover:bg-primary/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <MethodIcon method={method} className="w-4 h-4" />
                  {sendComm.isPending ? "Sending…" : "Confirm Send & Copy Note"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Contacts card ── */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-muted/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              <h2 className="font-bold text-sm text-foreground">Contacts</h2>
              {contacts.length > 0 && (
                <span className="text-xs bg-muted border border-border rounded-full px-2 py-0.5 text-muted-foreground">
                  {contacts.length}
                </span>
              )}
            </div>
            {!adding && (
              <button
                onClick={() => { setAdding(true); setEditingId(null); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            )}
          </div>

          <div className="divide-y divide-border">
            {contactsLoading && (
              <p className="text-muted-foreground text-center py-8 text-sm">Loading contacts…</p>
            )}

            {/* Add form */}
            {adding && (
              <div className="p-4 bg-primary/5 space-y-3">
                <p className="text-xs font-bold uppercase tracking-widest text-primary">New Contact</p>
                <input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Label (e.g. Pharmacy)"
                  className={inputCls}
                  autoFocus
                />
                <div className="flex gap-2">
                  {(["Fax", "Email", "SMS"] as CommMethod[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setNewType(m)}
                      className={typeTabCls(m, newType === m)}
                    >
                      <MethodIcon method={m} className="w-3 h-3" />
                      {m}
                    </button>
                  ))}
                </div>
                <input
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder={
                    newType === "Fax"
                      ? "Fax number"
                      : newType === "Email"
                      ? "Email address"
                      : "Phone number"
                  }
                  className={inputCls}
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleAddContact}
                    disabled={createEntry.isPending || !newLabel.trim() || !newValue.trim()}
                    className="px-4 py-1.5 rounded-lg font-bold text-sm bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add
                  </button>
                  <button
                    onClick={() => { setAdding(false); setNewLabel(""); setNewValue(""); setNewType("Fax"); }}
                    className="px-4 py-1.5 rounded-lg font-bold text-sm border border-border text-muted-foreground hover:bg-muted transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {!contactsLoading && contacts.length === 0 && !adding && (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-4">
                <div className="bg-muted/40 p-4 rounded-full">
                  <BookOpen className="w-6 h-6 text-muted-foreground/50" />
                </div>
                <p className="text-muted-foreground font-medium text-sm">No contacts yet</p>
                <p className="text-muted-foreground/60 text-xs">
                  Add destinations like Pharmacy, Specialist, or Hospital.
                </p>
              </div>
            )}

            {contacts.map((entry) => (
              <div key={entry.id} className="p-4">
                {editingId === entry.id ? (
                  <div className="space-y-3">
                    <input
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      placeholder="Label"
                      className={inputCls}
                    />
                    <div className="flex gap-2">
                      {(["Fax", "Email", "SMS"] as CommMethod[]).map((m) => (
                        <button
                          key={m}
                          onClick={() => setEditType(m)}
                          className={typeTabCls(m, editType === m)}
                        >
                          <MethodIcon method={m} className="w-3 h-3" />
                          {m}
                        </button>
                      ))}
                    </div>
                    <input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      placeholder={
                        editType === "Fax"
                          ? "Fax number"
                          : editType === "Email"
                          ? "Email address"
                          : "Phone number"
                      }
                      className={inputCls}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUpdateContact(entry.id)}
                        disabled={updateEntry.isPending}
                        className="px-4 py-1.5 rounded-lg font-bold text-sm bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30 transition-colors disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-4 py-1.5 rounded-lg font-bold text-sm border border-border text-muted-foreground hover:bg-muted transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <button
                      onClick={() => prefill(entry)}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left group/contact"
                      title="Click to pre-fill composer"
                    >
                      <div className={["p-2 rounded-lg shrink-0", iconBgCls(entry.contactType)].join(" ")}>
                        <MethodIcon
                          method={entry.contactType as CommMethod}
                          className={["w-4 h-4", iconColorCls(entry.contactType)].join(" ")}
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-foreground text-sm truncate group-hover/contact:text-primary transition-colors">
                          {entry.labelName}
                        </p>
                        <p className="text-muted-foreground text-xs font-mono truncate">
                          {entry.contactValue}
                        </p>
                      </div>
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => startEdit(entry)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteContact(entry.id, entry.labelName)}
                        disabled={deleteEntry.isPending}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-950/30 transition-colors disabled:opacity-50"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── History ── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-muted/20 flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          <h2 className="font-bold text-sm text-foreground">Communication History</h2>
          {commsHistory.length > 0 && (
            <span className="text-xs bg-muted border border-border rounded-full px-2 py-0.5 text-muted-foreground">
              {commsHistory.length}
            </span>
          )}
        </div>

        {historyLoading && (
          <p className="text-muted-foreground text-center py-8 text-sm">Loading history…</p>
        )}

        {!historyLoading && commsHistory.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
            <div className="bg-muted/40 p-4 rounded-full">
              <Send className="w-6 h-6 text-muted-foreground/50" />
            </div>
            <p className="text-muted-foreground font-medium text-sm">No communications yet</p>
            <p className="text-muted-foreground/60 text-xs">
              Use the Compose section above to send a message.
            </p>
          </div>
        )}

        {commsHistory.length > 0 && (
          <div className="divide-y divide-border">
            {commsHistory.map((log: CommunicationLog) => (
              <div key={log.id} className="flex items-start gap-4 px-5 py-4">
                <div className={["p-2 rounded-lg shrink-0 mt-0.5", iconBgCls(log.method)].join(" ")}>
                  <MethodIcon
                    method={log.method as CommMethod}
                    className={["w-4 h-4", iconColorCls(log.method)].join(" ")}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-foreground">{log.residentName}</span>
                    <span className="text-muted-foreground text-xs font-mono">Room {log.residentRoom}</span>
                    <span className="text-muted-foreground text-xs">→</span>
                    <span className="font-semibold text-sm text-foreground">{log.destinationLabel}</span>
                    <span className="text-muted-foreground text-xs font-mono truncate max-w-[160px]">
                      {log.contactValue}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={methodBadgeCls(log.method)}>{log.method}</span>
                    <span className="text-xs bg-emerald-900/40 text-emerald-400 border border-emerald-700/40 px-2 py-0.5 rounded-full font-bold">
                      {log.status}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono ml-auto">
                      {new Date(log.timestamp).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  {log.noteContent && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2 leading-relaxed font-mono bg-muted/30 rounded px-2 py-1">
                      {log.noteContent}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
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
  const [binderTab, setBinderTab] = useState<"Active" | "FamilyQA" | "Resolved">("Active");
  const queryClient = useQueryClient();

  const binderStatus = binderTab === "FamilyQA" ? ("Active" as const) : binderTab;
  const { data: entries = [], isLoading, refetch, isFetching } = useListBinderEntries(
    { status: binderStatus },
    { query: { enabled: binderTab !== "FamilyQA", queryKey: getListBinderEntriesQueryKey({ status: binderStatus }), refetchInterval: 30_000 } },
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
          onClick={() => setBinderTab("FamilyQA")}
          className={[
            "flex-1 py-3 rounded-xl font-bold text-sm uppercase tracking-wider border-2 transition-all flex items-center justify-center gap-2",
            binderTab === "FamilyQA"
              ? "bg-rose-700/20 border-rose-500 text-rose-300 shadow-md"
              : "bg-card border-border text-muted-foreground hover:border-rose-500/40",
          ].join(" ")}
        >
          <MessageCircle className="w-4 h-4" />
          Family Q&amp;A
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
          Resolved
        </button>
      </div>

      {binderTab === "FamilyQA" ? (
        <FamilyQAView />
      ) : (
        <>
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
        </>
      )}
    </section>
  );
}

// ── CPOE / Orders ─────────────────────────────────────────────────────────────

interface TemplateAccordionProps {
  template: OrderTemplate;
  isExpanded: boolean;
  onToggle: () => void;
  onAddAll: () => void;
  onToggleFavorite: () => void;
}

function TemplateAccordion({
  template,
  isExpanded,
  onToggle,
  onAddAll,
  onToggleFavorite,
}: TemplateAccordionProps) {
  let lines: string[] = [];
  try {
    lines = JSON.parse(template.contentJson) as string[];
  } catch {
    lines = [template.title];
  }

  return (
    <div>
      <div
        onClick={onToggle}
        className="w-full px-4 py-3.5 flex items-center gap-3 text-left cursor-pointer hover:bg-muted/40 transition-colors"
      >
        <ChevronDown
          className={["w-4 h-4 text-muted-foreground shrink-0 transition-transform", isExpanded ? "rotate-180" : ""].join(" ")}
        />
        <span className="flex-1 font-semibold text-sm text-foreground">{template.title}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
          className="shrink-0 p-1 rounded hover:bg-muted transition-colors"
          title={template.isFavorited ? "Remove from favorites" : "Add to favorites"}
        >
          <Star
            className={[
              "w-4 h-4 transition-colors",
              template.isFavorited ? "text-amber-400 fill-amber-400" : "text-muted-foreground/40 hover:text-amber-400",
            ].join(" ")}
          />
        </button>
      </div>
      {isExpanded && (
        <div className="bg-muted/20 px-4 pb-4 space-y-3">
          <ul className="space-y-1 pt-1">
            {lines.map((line, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                <span className="text-muted-foreground/60 mt-0.5 shrink-0">•</span>
                <span className="font-mono leading-relaxed">{line}</span>
              </li>
            ))}
          </ul>
          <button
            onClick={onAddAll}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold text-xs bg-violet-600/20 border border-violet-600/30 text-violet-300 hover:bg-violet-600/30 transition-colors w-full justify-center"
          >
            <Plus className="w-3.5 h-3.5" />
            Add All to Draft
          </button>
        </div>
      )}
    </div>
  );
}

function OrderHub({ lockedResident, compact }: {
  lockedResident?: { id: number; name: string; room: string };
  compact?: boolean;
} = {}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [residentQuery, setResidentQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedResidentId, setSelectedResidentId] = useState<number | null>(lockedResident?.id ?? null);
  const [selectedResidentName, setSelectedResidentName] = useState(lockedResident?.name ?? "");
  const [selectedResidentRoom, setSelectedResidentRoom] = useState(lockedResident?.room ?? "");
  const [draftLines, setDraftLines] = useState<string[]>([]);
  const [customOrder, setCustomOrder] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: allResidents = [] } = useListResidents({
    query: { queryKey: getListResidentsQueryKey() },
  });

  const { data: templates = [] } = useListOrderTemplates(undefined, {
    query: { queryKey: getListOrderTemplatesQueryKey() },
  });

  const residentOrdersParams = selectedResidentId !== null ? { residentId: selectedResidentId } : undefined;
  const { data: recentOrders = [] } = useListResidentOrders(residentOrdersParams, {
    query: {
      enabled: selectedResidentId !== null,
      queryKey: getListResidentOrdersQueryKey(residentOrdersParams),
    },
  });

  const toggleFav = useUpdateOrderTemplate({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListOrderTemplatesQueryKey() });
      },
    },
  });

  const signOrder = useSignResidentOrder({
    mutation: {
      onSuccess: async (order) => {
        const text = draftLines.join("\n");
        try { await navigator.clipboard.writeText(text); } catch { /* clipboard may be unavailable */ }
        setDraftLines([]);
        void queryClient.invalidateQueries({ queryKey: getListResidentOrdersQueryKey(residentOrdersParams) });
        toast({
          title: "Order Signed & Transmitted",
          description: `Faxed for ${order.residentName}. Note copied to clipboard.`,
        });
      },
      onError: () => {
        toast({ title: "Transmission Failed", description: "Could not sign the order. Please try again.", variant: "destructive" });
      },
    },
  });

  const filteredResidents = residentQuery.trim()
    ? allResidents
        .filter(
          (r) =>
            r.name.toLowerCase().includes(residentQuery.toLowerCase()) ||
            r.room.toLowerCase().includes(residentQuery.toLowerCase()),
        )
        .slice(0, 8)
    : [];

  const favorites = templates.filter((t) => t.isFavorited);
  const nonFavorites = templates.filter((t) => !t.isFavorited);

  function addTemplateToDraft(t: OrderTemplate) {
    try {
      const lines = JSON.parse(t.contentJson) as string[];
      setDraftLines((prev) => [...prev, ...lines.filter(Boolean)]);
    } catch {
      setDraftLines((prev) => [...prev, t.title]);
    }
  }

  function removeDraftLine(idx: number) {
    setDraftLines((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleSelectResident(id: number, name: string, room: string) {
    setSelectedResidentId(id);
    setSelectedResidentName(name);
    setSelectedResidentRoom(room);
    setResidentQuery("");
    setShowDropdown(false);
  }

  function handleSign() {
    if (selectedResidentId === null || draftLines.length === 0) return;
    signOrder.mutate({ data: { residentId: selectedResidentId, orderText: draftLines.join("\n") } });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      {!compact && (
        <div className="flex items-center gap-3">
          <div className="bg-violet-500/15 p-2.5 rounded-xl">
            <Stethoscope className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h2 className="font-bold text-lg text-foreground">CPOE — Computerized Provider Order Entry</h2>
            <p className="text-xs text-muted-foreground">Select a resident, build an order from templates or free text, then sign &amp; transmit.</p>
          </div>
        </div>
      )}

      {/* Resident Picker */}
      {!lockedResident && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Patient</p>
          {selectedResidentId !== null ? (
            <div className="flex items-center gap-3">
              <div className="flex-1 flex items-center gap-3 bg-violet-500/10 border border-violet-500/30 rounded-xl px-4 py-3">
                <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center shrink-0">
                  <span className="text-violet-400 font-bold text-xs">{selectedResidentName.slice(0, 2).toUpperCase()}</span>
                </div>
                <div>
                  <p className="font-bold text-foreground text-sm">{selectedResidentName}</p>
                  <p className="text-xs text-muted-foreground font-mono">Room {selectedResidentRoom}</p>
                </div>
              </div>
              <button
                onClick={() => { setSelectedResidentId(null); setSelectedResidentName(""); setSelectedResidentRoom(""); setDraftLines([]); }}
                className="p-2 rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Clear selection"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                value={residentQuery}
                onChange={(e) => { setResidentQuery(e.target.value); setShowDropdown(true); }}
                onFocus={() => { if (residentQuery) setShowDropdown(true); }}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                placeholder="Search by name or room number…"
                className="w-full bg-muted border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/50"
              />
              {showDropdown && filteredResidents.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-xl z-30 overflow-hidden">
                  {filteredResidents.map((r) => (
                    <button
                      key={r.id}
                      onMouseDown={() => handleSelectResident(r.id, r.name, r.room)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted text-left transition-colors"
                    >
                      <span className="font-medium text-sm text-foreground">{r.name}</span>
                      <span className="text-xs text-muted-foreground font-mono">Room {r.room}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-2 gap-5">
        {/* Column A: Order Sets */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-bold text-sm text-foreground">Order Sets &amp; Favorites</h3>
          </div>
          <div className="divide-y divide-border/60">
            {favorites.length > 0 && (
              <div className="bg-amber-950/20">
                <div className="px-4 py-2.5 flex items-center gap-2">
                  <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                  <span className="text-xs font-bold uppercase tracking-widest text-amber-400">Favorites</span>
                </div>
                {favorites.map((t) => (
                  <TemplateAccordion
                    key={t.id}
                    template={t}
                    isExpanded={expandedId === t.id}
                    onToggle={() => setExpandedId(expandedId === t.id ? null : t.id)}
                    onAddAll={() => addTemplateToDraft(t)}
                    onToggleFavorite={() =>
                      toggleFav.mutate({
                        templateId: t.id,
                        data: { category: t.category as "Order Set" | "Single Med", title: t.title, contentJson: t.contentJson, isFavorited: !t.isFavorited },
                      })
                    }
                  />
                ))}
              </div>
            )}
            {nonFavorites.map((t) => (
              <TemplateAccordion
                key={t.id}
                template={t}
                isExpanded={expandedId === t.id}
                onToggle={() => setExpandedId(expandedId === t.id ? null : t.id)}
                onAddAll={() => addTemplateToDraft(t)}
                onToggleFavorite={() =>
                  toggleFav.mutate({
                    templateId: t.id,
                    data: { category: t.category as "Order Set" | "Single Med", title: t.title, contentJson: t.contentJson, isFavorited: !t.isFavorited },
                  })
                }
              />
            ))}
            {templates.length === 0 && (
              <p className="text-muted-foreground text-sm text-center py-8">No order templates found.</p>
            )}
          </div>
        </div>

        {/* Column B: Custom Order + Recent Orders */}
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center gap-2">
              <Pencil className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-bold text-sm text-foreground">Custom Order</h3>
            </div>
            <div className="p-4 space-y-3">
              <textarea
                value={customOrder}
                onChange={(e) => setCustomOrder(e.target.value)}
                placeholder="Enter a free-text order (e.g. Metformin 500mg PO BID)…"
                rows={4}
                className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/40 focus:border-violet-500/50 resize-none font-mono"
              />
              <button
                disabled={!customOrder.trim()}
                onClick={() => { setDraftLines((prev) => [...prev, customOrder.trim()]); setCustomOrder(""); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm bg-violet-600/20 border border-violet-600/30 text-violet-300 hover:bg-violet-600/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5" />
                Add to Draft
              </button>
            </div>
          </div>

          {selectedResidentId !== null && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-muted-foreground" />
                <h3 className="font-bold text-sm text-foreground">Recent Orders — {selectedResidentName}</h3>
              </div>
              <div className="divide-y divide-border/50 max-h-56 overflow-y-auto">
                {recentOrders.length === 0 && (
                  <p className="text-muted-foreground text-sm text-center py-6">No orders on record.</p>
                )}
                {recentOrders.slice(0, 5).map((order) => (
                  <div key={order.id} className="px-4 py-3 flex items-start gap-3">
                    <span
                      className={[
                        "mt-0.5 shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border",
                        order.status === "Faxed"
                          ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                          : order.status === "Acknowledged"
                          ? "bg-primary/15 text-primary border-primary/30"
                          : "bg-muted text-muted-foreground border-border",
                      ].join(" ")}
                    >
                      {order.status}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground font-mono">
                        {new Date(order.timestamp).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })}
                      </p>
                      <p className="text-xs text-foreground/80 font-mono mt-0.5 truncate">{order.orderText.split("\n")[0]}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Active Draft */}
      <div className="bg-card border-2 border-violet-600/30 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-violet-600/20 bg-violet-950/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-violet-400" />
            <h3 className="font-bold text-sm text-violet-300">Active Draft</h3>
            {draftLines.length > 0 && (
              <span className="bg-violet-500/20 border border-violet-500/30 text-violet-300 text-xs font-bold px-2 py-0.5 rounded-full">
                {draftLines.length} {draftLines.length === 1 ? "item" : "items"}
              </span>
            )}
          </div>
          {draftLines.length > 0 && (
            <button
              onClick={() => setDraftLines([])}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold text-muted-foreground border border-border hover:bg-muted transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>
        <div className="p-4 min-h-[100px]">
          {draftLines.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
              <p className="text-muted-foreground text-sm">Draft is empty</p>
              <p className="text-muted-foreground/60 text-xs">
                Expand an order set and click "Add All to Draft", or write a custom order above.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {draftLines.map((line, idx) => (
                <li key={idx} className="flex items-start gap-2 group">
                  <span className="text-violet-500/60 font-mono text-xs mt-1 shrink-0 w-5 text-right">{idx + 1}.</span>
                  <span className="flex-1 text-sm font-mono text-foreground/90 bg-muted/40 rounded-lg px-3 py-1.5 border border-border/50 leading-relaxed">
                    {line}
                  </span>
                  <button
                    onClick={() => removeDraftLine(idx)}
                    className="opacity-0 group-hover:opacity-100 shrink-0 p-1 rounded hover:bg-red-600/20 text-muted-foreground hover:text-red-400 transition-all mt-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="px-4 py-4 border-t border-violet-600/20 bg-violet-950/10 flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground italic">
            {selectedResidentId === null
              ? "Select a resident above to enable signing."
              : draftLines.length === 0
              ? "Add at least one order to the draft to sign."
              : (
                <>
                  Ready to transmit{" "}
                  <span className="font-bold text-foreground not-italic">{draftLines.length} order{draftLines.length !== 1 ? "s" : ""}</span>
                  {" "}for{" "}
                  <span className="font-bold text-violet-300 not-italic">{selectedResidentName}</span>.
                </>
              )}
          </p>
          <button
            onClick={handleSign}
            disabled={selectedResidentId === null || draftLines.length === 0 || signOrder.isPending}
            className="shrink-0 flex items-center gap-2.5 px-6 py-2.5 rounded-xl font-bold text-sm bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-900/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {signOrder.isPending ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Sign &amp; Transmit
          </button>
        </div>
      </div>
    </div>
  );
}

// ── MRP helpers ───────────────────────────────────────────────────────────────

const MRP_LIST = ["Dr. S. Chang", "Dr. A. Patel", "Dr. R. Nguyen", "Dr. M. Kowalski", "Dr. L. Chen"];
function getMRP(residentId: number) { return MRP_LIST[(residentId - 6) % MRP_LIST.length]; }

// ── Physician Favorites helpers ───────────────────────────────────────────────

const PHYS_FAV_KEY = "ltc_physician_favorites_v1";
function loadPhysFavs(): Set<number> {
  try {
    const s = localStorage.getItem(PHYS_FAV_KEY);
    return s ? new Set(JSON.parse(s) as number[]) : new Set();
  } catch { return new Set(); }
}
function savePhysFavs(favs: Set<number>) {
  localStorage.setItem(PHYS_FAV_KEY, JSON.stringify([...favs]));
}

// ── Sort helpers ──────────────────────────────────────────────────────────────

type SortKey = "alertLevel" | "lastName" | "firstName" | "room" | "lastBM" | "gaps" | "blood" | "alerts" | "mrp";

function alertScore(r: ResidentAlertSummary) {
  return r.alertLevel === "red" ? 2 : r.alertLevel === "amber" ? 1 : 0;
}

function clinicalAlertCount(r: ResidentAlertSummary) {
  return [
    r.alertLevel !== "none",
    r.hasSeverePain,
    r.behaviorEventCount24h >= 2,
    r.hasFall24h,
    r.hasAbnormalVital24h,
    r.hasTaperActive,
  ].filter(Boolean).length;
}

function parseName(name: string) {
  const parts = name.trim().split(/\s+/);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

function SortTh({ label, sortK, currentKey, currentDir, onSort }: {
  label: string; sortK: SortKey; currentKey: SortKey;
  currentDir: "asc" | "desc"; onSort: (k: SortKey) => void;
}) {
  const active = currentKey === sortK;
  return (
    <th
      className="px-4 py-4 text-left text-xs uppercase tracking-widest font-bold cursor-pointer select-none whitespace-nowrap transition-colors hover:text-foreground"
      onClick={() => onSort(sortK)}
    >
      <span className={["flex items-center gap-1.5", active ? "text-primary" : "text-muted-foreground"].join(" ")}>
        {label}
        <span className="text-[11px] leading-none">
          {active ? (currentDir === "asc" ? "↑" : "↓") : <span className="opacity-25">↕</span>}
        </span>
      </span>
    </th>
  );
}

// ── Care Pathways View ────────────────────────────────────────────────────────

interface PathwayAlert {
  variant: "outline-red" | "solid-red" | "solid-amber";
  title?: string;
  content: string;
}

interface PathwayStepMeta {
  step: number;
  title: string;
  criteriaCallout?: string;
}

interface PathwayOrderItem {
  id: string;
  step: number;
  label: string;
  detail: string;
}

interface Pathway {
  id: string;
  title: string;
  formRef: string;
  alerts: PathwayAlert[];
  steps: PathwayStepMeta[];
  orders: PathwayOrderItem[];
}

const ALL_PATHWAYS: Pathway[] = [
  {
    id: "weight-loss",
    title: "Unintentional Weight Loss & FTT Diagnostic & Clinical Orders",
    formRef: "LTC-FORM-2024 (Rev. 2026)",
    alerts: [
      { variant: "outline-red", title: "Clinical Alert", content: "Unintentional weight loss is a major regulatory and quality-of-care metric in LTC. Knee-jerk ordering of commercial high-protein supplements is often ineffective and can reduce intake of normal meals. Prioritize identifying reversible causes (dentition, dysphagia, depression, polypharmacy)." },
      { variant: "solid-red", content: "⚠️ CONTRAINDICATED: Megestrol acetate (Megace) is strongly discouraged by the Beers Criteria in older adults due to a high risk of deep vein thrombosis (DVT), fluid retention, and increased mortality with minimal lean muscle mass benefit." },
    ],
    steps: [
      { step: 1, title: "Diagnostic Workup & Allied Health Consults" },
      { step: 2, title: "Medication Review & Deprescribing" },
      { step: 3, title: "Dietary & Nursing Interventions" },
      { step: 4, title: "Pharmacological Appetite Stimulation (Safe Alternatives)", criteriaCallout: "Consider only if non-pharmacological interventions fail, weight loss is severe (>5% in 1 month or >10% in 6 months), and it aligns with Goals of Care." },
    ],
    orders: [
      { id: "wl-s1-dx",     step: 1, label: "Baseline Diagnostics",                        detail: "Order CBC, Albumin, TSH, Electrolytes, Creatinine, Calcium, and Fasting Glucose." },
      { id: "wl-s1-dent",   step: 1, label: "Dentition Check",                             detail: "Inspect mouth for poorly fitting dentures, severe dental caries, dry mouth (xerostomia), or oral candidiasis (thrush)." },
      { id: "wl-s1-dep",    step: 1, label: "Depression Screening",                        detail: "Administer the Geriatric Depression Scale (GDS) or PHQ-9 modified for dementia." },
      { id: "wl-s1-diet",   step: 1, label: "Consult Dietitian",                           detail: "Comprehensive nutritional assessment, calorie count, and food preference audit." },
      { id: "wl-s1-slp",    step: 1, label: "Consult Speech-Language Pathology (SLP)",     detail: "Swallowing evaluation if signs of dysphagia (coughing/choking during meals) are present." },
      { id: "wl-s2-meds",   step: 2, label: "Audit Medication Regimen",                    detail: "Review and taper/discontinue appetite-suppressing medications if clinically safe: Cholinesterase Inhibitors (donepezil, galantamine, rivastigmine), Activating SSRIs (fluoxetine), Topiramate, and chronic Digoxin (rule out toxicity)." },
      { id: "wl-s2-supp",   step: 2, label: "Supplement Consolidation",                    detail: "Consolidate or eliminate non-essential supplements to address high-pill-burden configurations." },
      { id: "wl-s3-wt",     step: 3, label: "Weight & Fluid Monitoring",                   detail: "Implement weekly weights × 4 weeks, then monthly once stable. Record food and fluid intake records × 7 days." },
      { id: "wl-s3-food",   step: 3, label: "Food Enhancement",                            detail: "Provide nutrient-dense options (e.g., add real butter, cream, or gravy to meals; offer full-fat dairy/whole milk instead of skim)." },
      { id: "wl-s3-dining", step: 3, label: "Dining Environment",                          detail: "Provide feeding assistance or verbal cueing during meals. Serve meals in a calm, socially engaging dining environment. Encourage small, frequent finger foods and snacks between meals." },
      { id: "wl-s4-mirt",   step: 4, label: "mirtazapine (Remeron) 7.5 mg PO at bedtime", detail: "Blocks 5-HT2/3 receptors to induce weight gain, stimulate appetite, and improve nocturnal sleep. Titrate to 15 mg if tolerated after 2 weeks." },
    ],
  },
  {
    id: "pneumonia",
    title: "Pneumonia (CAP / Aspiration) — Diagnosis & Treatment Orders",
    formRef: "LTC-FORM-2025-PNA (Rev. 2026)",
    alerts: [
      { variant: "outline-red", title: "Clinical Alert", content: "Aspiration is the most common cause of pneumonia in LTC residents. Always assess swallowing safety and implement dysphagia precautions. Positioning modifications and thickened fluids may be as important as antibiotics. Review Goals of Care before initiating IV antibiotics or hospital transfer." },
      { variant: "solid-red", content: "⚠️ HIGH-RISK: Fluoroquinolone antibiotics (levofloxacin, ciprofloxacin) are associated with C. difficile colitis, tendon rupture, QT prolongation, and CNS effects (delirium, confusion) in older adults. Reserve for documented penicillin allergy or confirmed treatment failure." },
    ],
    steps: [
      { step: 1, title: "Diagnostic Assessment" },
      { step: 2, title: "Hospitalization vs. In-Facility Treatment Decision", criteriaCallout: "CURB-65: Confusion, Urea >7 mmol/L, RR ≥30, BP <90/60, Age ≥65. Score 0–1: treat in facility. Score 2: consider hospital. Score 3+: hospital transfer. Always weigh against Goals of Care." },
      { step: 3, title: "Empiric Antibiotic Therapy (In-Facility)" },
      { step: 4, title: "Supportive Care & Monitoring" },
    ],
    orders: [
      { id: "pna-s1-cxr",      step: 1, label: "Chest X-Ray",                                                                          detail: "Order portable CXR if resident is immobile. Clinical diagnosis is acceptable when CXR is not feasible." },
      { id: "pna-s1-labs",     step: 1, label: "Baseline Bloodwork",                                                                   detail: "CBC, CRP, Creatinine, Electrolytes, Blood Glucose. Blood Cultures × 2 if sepsis criteria met." },
      { id: "pna-s1-sputum",   step: 1, label: "Sputum Culture",                                                                       detail: "Send sputum culture BEFORE antibiotics if resident has productive cough and can cooperate. Document clinical indication on requisition." },
      { id: "pna-s1-o2",       step: 1, label: "Pulse Oximetry — Baseline",                                                            detail: "Document baseline SpO2. Target ≥92% on supplemental O2 (or per Goals of Care)." },
      { id: "pna-s2-goc",      step: 2, label: "Review Goals of Care",                                                                 detail: "Confirm hospitalization aligns with stated Goals of Care before transfer. Document SDM discussion if care direction changed." },
      { id: "pna-s3-abx1",     step: 3, label: "Mild-moderate CAP (no recent antibiotics): amoxicillin-clavulanate 875/125 mg PO BID × 5–7 days", detail: "First-line for CAP in LTC without recent antibiotic exposure." },
      { id: "pna-s3-abx2",     step: 3, label: "Moderate CAP (recent antibiotics): levofloxacin 750 mg PO daily × 5 days",            detail: "Use only if recent beta-lactam failure or allergy. Monitor for QTc prolongation and delirium." },
      { id: "pna-s3-asp",      step: 3, label: "Aspiration pneumonia: amoxicillin-clavulanate 875/125 mg PO BID × 7 days",             detail: "Provides anaerobic coverage. Extend duration to 7 days given aspiration source." },
      { id: "pna-s3-allergy",  step: 3, label: "Severe penicillin allergy: azithromycin 500 mg PO daily × 5 days",                     detail: "If fluoroquinolone also contraindicated. Document allergy clearly. Monitor QTc." },
      { id: "pna-s4-o2tx",     step: 4, label: "O2 Supplementation",                                                                  detail: "Maintain SpO2 ≥92% via nasal prongs or face mask. Reassess need daily." },
      { id: "pna-s4-fluids",   step: 4, label: "Oral Hydration / IV Fluids",                                                          detail: "Encourage oral fluids. Consider IV or hypodermoclysis if oral intake critically poor and consistent with Goals of Care." },
      { id: "pna-s4-apap",     step: 4, label: "Acetaminophen 650 mg PO/PR q4–6h PRN (fever / discomfort)",                           detail: "Avoid NSAIDs in older adults. Max 3 g/day in LTC setting." },
      { id: "pna-s4-repo",     step: 4, label: "Repositioning & Aspiration Precautions",                                              detail: "Reposition every 2h. Elevate head of bed ≥30°. Notify SLP if aspiration suspected." },
      { id: "pna-s4-reassess", step: 4, label: "72-Hour Clinical Reassessment",                                                       detail: "If no improvement by 72h, reassess diagnosis, antibiotic choice, and need for hospital transfer." },
    ],
  },
  {
    id: "eol",
    title: "End of Life / Palliative Comfort Care Orders",
    formRef: "LTC-FORM-2023-EOL (Rev. 2026)",
    alerts: [
      { variant: "outline-red", title: "Care Philosophy", content: "Once comfort-focused care is documented, every intervention must be evaluated: 'Does this contribute to the resident's comfort?' If the answer is no, it should be discontinued — regardless of prior routine practice, regulatory defaults, or family expectation. The goal is comfort, dignity, and symptom relief." },
      { variant: "solid-red", content: "⚠️ Opioid dosing at end of life is titrated to symptom relief, not a fixed dose ceiling. The ethical principle of double effect permits symptom-controlling doses even if they may incidentally hasten death. Document clinical indication (pain, dyspnea) for every dose ordered." },
    ],
    steps: [
      { step: 1, title: "Goals of Care & SDM Consent" },
      { step: 2, title: "Comfort Medication Orders (Anticipatory Prescribing)" },
      { step: 3, title: "Discontinue Non-Comfort Interventions" },
      { step: 4, title: "Family, Spiritual & Bereavement Care" },
    ],
    orders: [
      { id: "eol-s1-goc",    step: 1, label: "Goals of Care Conversation — Document in Chart",                    detail: "Initiate or confirm Goals of Care discussion with SDM/family. Document code status, hospitalization preference, and care direction clearly." },
      { id: "eol-s1-dnr",    step: 1, label: "Code Status: DNR / DNI / Comfort Care Only",                       detail: "Complete Code Status documentation per provincial/territorial form. Ensure copy is accessible to all care staff and on-call coverage." },
      { id: "eol-s1-acp",    step: 1, label: "Advance Care Planning Documentation",                              detail: "Confirm or complete Advance Directive / Personal Directive. Document SDM name, relationship, and contact information." },
      { id: "eol-s1-notify", step: 1, label: "Notify Family of Transition to Palliative Care",                   detail: "Document family notification, understanding, and any questions raised. Offer in-person or video family meeting with care team." },
      { id: "eol-s2-morph",  step: 2, label: "morphine 2.5 mg SC/SL q4h PRN — pain or dyspnea",                 detail: "Starting dose for opioid-naïve residents. Titrate by 25–50% if inadequate relief after 24h." },
      { id: "eol-s2-btx",    step: 2, label: "morphine 1–2.5 mg SC q1h PRN — breakthrough",                     detail: "Breakthrough dose = 10–15% of 24h total opioid dose. Assess response within 30 minutes." },
      { id: "eol-s2-midaz",  step: 2, label: "midazolam 2.5 mg SC q4h PRN — anxiety / terminal restlessness",   detail: "For refractory agitation or terminal restlessness not responsive to repositioning or verbal reassurance." },
      { id: "eol-s2-haldo",  step: 2, label: "haloperidol 0.5–1 mg SC q4–6h PRN — nausea / delirium",           detail: "For nausea or hyperactive delirium. Avoid in Lewy body dementia." },
      { id: "eol-s2-glyco",  step: 2, label: "glycopyrrolate 0.2 mg SC q4h PRN — secretions (death rattle)",    detail: "For noisy breathing from pooled oropharyngeal secretions. Resident is typically unconscious — primarily for family comfort." },
      { id: "eol-s2-apap",   step: 2, label: "Acetaminophen 650 mg PR/SL q6h PRN — pain / fever",               detail: "When oral route is lost. Maintain for baseline comfort even in unconscious residents." },
      { id: "eol-s3-meds",   step: 3, label: "Discontinue Non-Comfort Medications",                             detail: "Stop: statins, antihypertensives, vitamins/supplements, diabetes agents (unless hypoglycemia risk), anticoagulants, dementia medications, bisphosphonates." },
      { id: "eol-s3-vitals", step: 3, label: "Discontinue Routine Vital Signs",                                  detail: "Replace scheduled VS monitoring with comfort-focused assessment: breathing pattern, pain indicators, consciousness level." },
      { id: "eol-s3-labs",   step: 3, label: "Discontinue Routine Lab Draws",                                    detail: "Cancel all pending and recurring lab orders unless a result would directly change a comfort measure." },
      { id: "eol-s3-fluids", step: 3, label: "Discontinue IV Fluids / Enteral Nutrition",                        detail: "Unless oral/IV fluids demonstrably relieve symptoms (e.g., thirst, dry mouth). Document rationale if continuing." },
      { id: "eol-s3-o2",     step: 3, label: "Reassess O2 Supplementation",                                     detail: "Discontinue supplemental O2 unless resident reports subjective relief of dyspnea. SpO2 is not a comfort target at end of life." },
      { id: "eol-s4-chap",   step: 4, label: "Chaplain / Spiritual Care Referral",                              detail: "Contact chaplain per resident and family wishes. Document spiritual care preferences in chart." },
      { id: "eol-s4-pkg",    step: 4, label: "Provide Family Palliative Care Information Package",               detail: "Includes: what to expect in final days, role of comfort medications, facility bereavement resources, and after-death procedures." },
      { id: "eol-s4-brvmt",  step: 4, label: "Arrange Bereavement Follow-Up",                                   detail: "Schedule bereavement contact with family at 2–4 weeks post-death. Document support offered." },
      { id: "eol-s4-brief",  step: 4, label: "Brief All Care Staff on Comfort-Only Plan",                       detail: "Ensure all nursing and care aide staff are aware of comfort-focused care plan. Provide handoff to on-call coverage." },
    ],
  },
  {
    id: "uti",
    title: "UTI Diagnosis (McGeer Criteria) & Antibiotic Treatment Orders",
    formRef: "LTC-FORM-2025-UTI (Rev. 2026)",
    alerts: [
      { variant: "outline-red", title: "Antibiotic Stewardship Alert", content: "Asymptomatic bacteriuria (ASB) — a positive urine culture without symptoms — must NOT be treated with antibiotics. This is the single most common driver of inappropriate antibiotic use in LTC and directly contributes to Clostridioides difficile, antibiotic resistance, and drug-related adverse events. Treat the patient, not the culture result." },
      { variant: "solid-amber", content: "⚠️ Stewardship note: Nitrofurantoin is contraindicated when eGFR < 30 mL/min/1.73m² (common in LTC). Fluoroquinolones should be reserved for documented allergy or culture-confirmed resistance. Cloudy or malodorous urine alone does NOT meet McGeer Criteria." },
    ],
    steps: [
      { step: 1, title: "Diagnosis — Apply McGeer Criteria (Minimum Criteria Required)" },
      { step: 2, title: "Urine Culture — Before Antibiotics" },
      { step: 3, title: "Empiric Antibiotic Selection (Pending Culture)" },
      { step: 4, title: "Monitoring, De-escalation & Stewardship Review" },
    ],
    orders: [
      { id: "uti-s1-nocath",  step: 1, label: "Non-Catheterized Resident — McGeer Criteria (≥3 required)",                      detail: "Fever >38°C or temp change >1.5°C from baseline; new/worsened urinary urgency, frequency, or incontinence; new flank or suprapubic pain; gross hematuria; rigors; or new-onset delirium with no other identifiable cause." },
      { id: "uti-s1-cath",    step: 1, label: "Catheterized Resident — McGeer Criteria (≥2 required)",                         detail: "Fever >38°C; new flank or suprapubic pain/tenderness; rigors; or new-onset delirium with no other identifiable cause. Replace catheter before starting antibiotics." },
      { id: "uti-s1-not-dx",  step: 1, label: "Document: Symptoms Ruling OUT Diagnosis",                                       detail: "Malodorous urine, cloudy urine, or colour change ALONE do NOT meet McGeer Criteria and must NOT trigger antibiotic treatment. Document this negative assessment in the chart." },
      { id: "uti-s2-culture", step: 2, label: "Midstream Urine (MSU) or Catheter Specimen for Culture + Sensitivity",          detail: "Send BEFORE starting antibiotics. Include clinical indication (McGeer criteria met) on requisition. Do not send culture for asymptomatic residents." },
      { id: "uti-s2-cath-cx", step: 2, label: "Catheter Replacement (Catheterized Residents)",                                 detail: "Replace indwelling catheter before collecting culture specimen and before starting antibiotics." },
      { id: "uti-s3-nitro",   step: 3, label: "Uncomplicated UTI (no systemic signs): nitrofurantoin monohydrate 100 mg PO BID × 5–7 days", detail: "First-line. CONTRAINDICATED if eGFR < 30 mL/min/1.73m². Do not use for pyelonephritis (poor tissue penetration)." },
      { id: "uti-s3-tmp",     step: 3, label: "Complicated UTI / systemic signs: TMP-SMX DS 1 tab PO BID × 7 days",           detail: "Trimethoprim-sulfamethoxazole. Check local resistance rates. Contraindicated with sulfonamide allergy or eGFR < 15." },
      { id: "uti-s3-cipro",   step: 3, label: "Complicated UTI / TMP-SMX allergy: ciprofloxacin 250–500 mg PO BID × 7 days",  detail: "Reserve for allergy or culture-confirmed TMP-SMX resistance. Monitor for CNS effects (delirium) and QTc prolongation." },
      { id: "uti-s3-cauti",   step: 3, label: "Catheter-Associated UTI: 7–14 day course (per clinical response)",              detail: "Replace catheter before starting antibiotics. Adjust to narrowest effective agent per culture sensitivity." },
      { id: "uti-s4-48h",     step: 4, label: "48–72h Reassessment",                                                          detail: "If no clinical improvement, reassess diagnosis, broaden coverage, or consider transfer. If improving, continue current course." },
      { id: "uti-s4-deesc",   step: 4, label: "De-escalate Antibiotic to Culture Sensitivity",                                 detail: "When C&S returns, narrow to shortest-course, most targeted antibiotic per sensitivity. Document in MAR with expected end date." },
      { id: "uti-s4-doc",     step: 4, label: "Document Antibiotic Indication, Start Date & Stop Date",                       detail: "Required for antibiotic stewardship audit. Include McGeer criteria met, culture result, and antibiotic end date in the chart." },
      { id: "uti-s4-cath",    step: 4, label: "Reassess Catheter Necessity",                                                   detail: "Remove indwelling catheter if no longer clinically indicated. Each day of catheterization increases infection risk by 3–10%." },
    ],
  },
  {
    id: "bpsd",
    title: "BPSD Management — Antipsychotic Stewardship, Non-Antipsychotic & Non-Pharmacological Orders",
    formRef: "LTC-FORM-2026-BPSD (Rev. 2026)",
    alerts: [
      { variant: "outline-red", title: "Antipsychotic Stewardship", content: "Antipsychotics are NOT first-line for BPSD. Non-pharmacological interventions must be documented and trialed before any medication is initiated. Antipsychotic use in dementia is associated with increased stroke risk, falls, aspiration pneumonia, accelerated cognitive decline, and mortality. In Canada, antipsychotic prescribing without CIHI exclusion criteria is a direct LTC quality indicator." },
      { variant: "solid-red", content: "⚠️ ABSOLUTE CONTRAINDICATION — ALL antipsychotics in Lewy Body Dementia (LBD) and Parkinson’s Disease Dementia (PDD): High risk of fatal neuroleptic sensitivity reaction (severe rigidity, hyperthermia, rapid cognitive collapse, death). Do NOT initiate any antipsychotic if LBD/PDD is suspected or confirmed without specialist consultation." },
      { variant: "solid-amber", content: "⚠️ Beers Criteria & STOPP: Avoid antipsychotics in dementia except for short-term, documented severe agitation with imminent harm, or active psychosis. If initiating, use the lowest effective dose, obtain informed SDM consent, document the specific target behavior and baseline severity score, reassess at 4 weeks, and attempt gradual dose reduction every 3–6 months." },
    ],
    steps: [
      { step: 1, title: "Behavioral Assessment & Delirium Exclusion" },
      { step: 2, title: "Non-Pharmacological Interventions (First-Line — Must Document Before Any Medication)" },
      { step: 3, title: "Non-Antipsychotic Pharmacological Options (by Target Symptom)" },
      { step: 4, title: "Antipsychotic Prescribing (Last Resort — Specific Indications Only)", criteriaCallout: "Antipsychotics are only indicated for: (1) psychosis (delusions or hallucinations) causing significant distress or safety risk, OR (2) physical aggression posing imminent harm to the resident or others — after a documented trial of non-pharmacological and non-antipsychotic interventions. Obtain informed SDM consent. Document the specific target behavior and baseline severity score before initiating. Reassess at 4 weeks. Attempt gradual dose reduction at 3 months and every 3–6 months thereafter." },
    ],
    orders: [
      { id: "bpsd-s1-abc",      step: 1, label: "Behavioral Assessment — ABC Chart / NPI-NH",                                       detail: "Document Antecedent, Behavior, Consequence across shifts × 72h. Record frequency, intensity, and duration. Identify triggers (time of day, specific caregivers, tasks, environment). Use NPI-NH or CMAI if available." },
      { id: "bpsd-s1-cam",      step: 1, label: "Rule Out Delirium — Confusion Assessment Method (CAM)",                            detail: "Delirium is reversible and frequently mimics BPSD. Perform CAM assessment. Investigate and treat: infection (UTI, pneumonia), constipation, urinary retention, pain, recent medication change, dehydration, metabolic disturbance (electrolytes, glucose, thyroid)." },
      { id: "bpsd-s1-pain",     step: 1, label: "Pain Screening — PAINAD Scale (Non-Verbal Residents)",                             detail: "Undertreated pain is a leading driver of behavioral disturbance. If PAINAD ≥ 3, initiate a scheduled acetaminophen trial (650 mg PO TID × 1 week) before any psychotropic is considered." },
      { id: "bpsd-s1-meds",     step: 1, label: "Medication Review for Behavioral Side-Effects",                                         detail: "Review for medications that can precipitate agitation or psychosis: anticholinergics (diphenhydramine / Benadryl), benzodiazepines, corticosteroids, dopaminergic agents, opioids (delirium risk), and fluoroquinolones. Consider discontinuation or substitution." },
      { id: "bpsd-s1-subtype",  step: 1, label: "Confirm Dementia Subtype — Directly Guides Pharmacological Selection",              detail: "Alzheimer’s: risperidone is the only Health Canada–approved antipsychotic for BPSD. Lewy Body / PDD: ALL antipsychotics contraindicated. Vascular dementia: elevated cerebrovascular event risk with antipsychotics. Frontotemporal (FTD): SSRIs first-line; antipsychotics rarely effective and often worsen behaviour." },
      { id: "bpsd-s2-activity", step: 2, label: "Individualized Structured Activity Programming",                                        detail: "Schedule 30–60 min daily engagement based on resident’s lifelong interests (music, crafts, gardening, reminiscence). Engage recreation therapy for a personalized activity plan. Document participation response." },
      { id: "bpsd-s2-music",    step: 2, label: "Music Therapy — Preferred Genre",                                                  detail: "Play resident’s preferred music during personal care, mealtimes, and agitation episodes. Strong evidence for reducing agitation and distress in moderate-to-severe dementia. Document which music is effective and at which times of day." },
      { id: "bpsd-s2-comms",    step: 2, label: "Dementia Communication Training — Staff Education",                                detail: "Train staff to use validation (join the resident’s emotional reality), redirection, and non-confrontational language. Never correct or argue. Document staff education completed. Consider Positive Behavioural Support (PBS) framework consult." },
      { id: "bpsd-s2-env",      step: 2, label: "Environmental Modifications",                                                           detail: "Reduce auditory/visual stimulation during behavioral peaks. Provide access to secure outdoor space (especially for sundowning). Install visual cueing for toileting. Ensure adequate, non-glare lighting. Remove triggers identified in ABC assessment." },
      { id: "bpsd-s2-assign",   step: 2, label: "Consistent Care Assignment",                                                           detail: "Assign the same 2–3 care aides across shifts. Familiarity with a consistent caregiver significantly reduces anxiety-driven behavioral responses. Document primary care aide assignment in the care plan." },
      { id: "bpsd-s2-sleep",    step: 2, label: "Sleep Hygiene Protocol",                                                               detail: "Regularize sleep-wake schedule. Reduce daytime napping. Increase daytime light exposure (near window or bright light lamp 30 min AM). Avoid caffeine after 2 PM. Limit fluids 2h before bed if nocturia is driving nighttime disturbance." },
      { id: "bpsd-s2-toilet",   step: 2, label: "Scheduled Toileting & Comfort Rounds",                                                 detail: "Prompted voiding every 2h during waking hours. Relieve constipation proactively — agitation frequently spikes with a BM gap >48h. Ensure comfort: pain, heat, cold, and positioning discomfort are common triggers." },
      { id: "bpsd-s3-cit",      step: 3, label: "Agitation + Depression / Anxiety in AD: citalopram 10 mg PO daily → 20 mg",       detail: "Strongest evidence among SSRIs for BPSD agitation in Alzheimer’s (CitAD trial). Avoid doses > 20 mg in older adults due to QTc prolongation. Obtain baseline ECG. Onset of benefit: 2–4 weeks." },
      { id: "bpsd-s3-sert",     step: 3, label: "Agitation + Depression in FTD or AD: sertraline 25 mg PO daily → 50–100 mg", detail: "Preferred SSRI for frontotemporal dementia behavioral symptoms (disinhibition, irritability). Fewer drug interactions than citalopram. Also reasonable first-line for AD. Titrate slowly at 2-week intervals." },
      { id: "bpsd-s3-mirt",     step: 3, label: "Sleep Disturbance + Agitation + Low Appetite: mirtazapine 7.5 mg PO at bedtime",      detail: "Sedating (strongly at low dose), appetite-stimulating, and anxiolytic. Titrate to 15 mg after 2 weeks if needed. Caution if high falls risk. Can cause orthostatic hypotension." },
      { id: "bpsd-s3-mel",      step: 3, label: "Sleep-Wake Cycle Disruption / Sundowning: melatonin 1–5 mg PO at bedtime",        detail: "Very low-risk option. Modest evidence for circadian rhythm disruption in dementia. Start at 1 mg and titrate. No significant drug interactions. Does not address daytime agitation." },
      { id: "bpsd-s3-mem",      step: 3, label: "Moderate-to-Severe AD Agitation: memantine 5 mg PO daily → titrate to 20 mg",    detail: "NMDA receptor antagonist with modest evidence for agitation reduction in moderate-to-severe Alzheimer’s. Well-tolerated. Adjust for renal impairment (eGFR < 30: max 10 mg/day)." },
      { id: "bpsd-s3-valp",     step: 3, label: "Agitation Unresponsive to SSRIs: divalproex ER 125–250 mg PO BID",               detail: "Monitor LFTs, CBC, and valproic acid levels (target 350–700 µmol/L for BPSD). Drug interaction: significantly elevates warfarin effect — check INR. Caution with carbapenems (reduce valproate levels acutely)." },
      { id: "bpsd-s3-lora",     step: 3, label: "Acute Severe Agitation (bridge only): lorazepam 0.25 mg PO/SL PRN q6h ≤7 days",  detail: "Beers Criteria: extreme caution. Risk of paradoxical agitation, falls, oversedation, respiratory depression. Limit to acute crisis ≤7 days only. Do NOT use as ongoing management. Avoid in respiratory disease or prior benzodiazepine sensitivity." },
      { id: "bpsd-s4-consent",  step: 4, label: "Obtain Informed Consent from SDM — Document in Chart",                            detail: "Discuss risks (stroke, falls, aspiration pneumonia, mortality, accelerated cognitive decline) vs. potential benefit for the specific target behavior. Document SDM name, date of consent conversation, and understanding of risks. Consent is required before initiation." },
      { id: "bpsd-s4-baseline", step: 4, label: "Document Target Behavior + Baseline Severity Score",                                   detail: "Record the specific target behavior (e.g., ‘physical aggression during morning care — 3×/shift’), baseline NPI-NH or CMAI score, and the date. Required to evaluate treatment response at 4-week reassessment." },
      { id: "bpsd-s4-risp",     step: 4, label: "Physical Aggression or Psychosis in AD: risperidone 0.25 mg PO daily or BID",         detail: "Only antipsychotic with Health Canada approval for short-term BPSD. Target behaviors: physical aggression, paranoid delusions, command hallucinations. Titrate slowly; maximum 1–2 mg/day in LTC. Monitor for EPS, orthostatic hypotension, and sedation." },
      { id: "bpsd-s4-quet",     step: 4, label: "Psychosis + Sleep Disturbance / Sundowning: quetiapine 12.5–25 mg PO at bedtime", detail: "Off-label in Canada for BPSD. Lower EPS risk than risperidone. More sedating — use with caution if high falls risk. Monitor for orthostatic hypotension (lying/standing BP). Not appropriate for daytime agitation as monotherapy." },
      { id: "bpsd-s4-haldo",    step: 4, label: "Acute Severe Agitation Unresponsive to Other Measures: haloperidol 0.25–0.5 mg PO/SC PRN", detail: "Reserve for acute episodes only (<7 days). High EPS risk. ABSOLUTE CONTRAINDICATION in LBD/PDD. Not appropriate for chronic scheduled dosing in LTC. If repeated PRN use is needed, transition to scheduled low-dose atypical antipsychotic with formal reassessment." },
      { id: "bpsd-s4-4wk",      step: 4, label: "4-Week Reassessment — Response vs. Baseline Score + Adverse Effects",             detail: "Compare target behavior frequency/severity to baseline NPI-NH or CMAI score. If no measurable improvement, discontinue rather than escalate dose. Review for: EPS, sedation, new falls, weight gain. Document in chart." },
      { id: "bpsd-s4-taper",    step: 4, label: "Gradual Dose Reduction at 3 Months — Attempt Deprescribing",                      detail: "Reduce antipsychotic dose by 25–50% over 4 weeks while monitoring for behavioral relapse. Repeat every 3–6 months. Most residents can be successfully tapered off after 6–12 months. Document each attempt and outcome." },
    ],
  },
];

function PathwayCard({ pathway }: { pathway: Pathway }) {
  const { toast } = useToast();
  const [isExpanded, setIsExpanded] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [committedText, setCommittedText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const toggleCheck = (id: string) =>
    setChecked((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const checkedCount = checked.size;
  const totalCount = pathway.orders.length;

  const handleCommit = () => {
    if (checkedCount === 0) {
      toast({ title: "No orders selected", description: "Select at least one order before committing.", variant: "destructive" });
      return;
    }
    const now = new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
    const lines: string[] = [
      "STANDARDIZED CARE PATHWAY ORDERS",
      pathway.title,
      `Form Ref: ${pathway.formRef} — Signed ${now}`,
      "",
    ];
    pathway.steps.forEach(({ step, title }) => {
      const stepOrders = pathway.orders.filter((o) => o.step === step && checked.has(o.id));
      if (stepOrders.length === 0) return;
      lines.push(`STEP ${step}: ${title.toUpperCase()}`);
      stepOrders.forEach((o, idx) => {
        lines.push(`  ${idx + 1}. ${o.label}`);
        lines.push(`     ${o.detail}`);
      });
      lines.push("");
    });
    lines.push("---");
    lines.push("Orders committed to eMAR and Care Directive files.");
    const text = lines.join("\n");
    setCommittedText(text);
    setCopied(false);
    navigator.clipboard.writeText(text).catch(() => {});
    toast({ title: "Orders committed", description: "Orders committed to eMAR. Formatted summary ready to copy below." });
  };

  const handleCopyText = () => {
    if (!committedText) return;
    navigator.clipboard.writeText(committedText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const alertContainerClass = (v: PathwayAlert["variant"]) =>
    v === "outline-red" ? "rounded-xl border-2 border-red-500/60 bg-transparent p-4"
    : v === "solid-red"  ? "rounded-xl bg-red-900/50 border border-red-700/60 p-4"
    :                      "rounded-xl bg-amber-950/40 border border-amber-700/50 p-4";

  const alertTextClass = (v: PathwayAlert["variant"]) =>
    v === "outline-red" ? "text-sm text-red-300/90 leading-relaxed"
    : v === "solid-red"  ? "text-sm font-bold text-red-200 leading-relaxed"
    :                      "text-sm font-bold text-amber-300/90 leading-relaxed";

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      {/* Accordion header */}
      <button
        onClick={() => setIsExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-muted/20 transition-colors"
      >
        <div className="flex-1 min-w-0 pr-4">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="font-bold text-base text-foreground leading-snug">{pathway.title}</p>
            <span className="shrink-0 text-[11px] font-mono bg-muted/60 border border-border/60 text-muted-foreground px-2.5 py-0.5 rounded-full whitespace-nowrap">
              Form Ref: {pathway.formRef}
            </span>
          </div>
          {!isExpanded && checkedCount > 0 && (
            <p className="text-xs text-primary mt-1.5">{checkedCount} of {totalCount} orders selected</p>
          )}
        </div>
        {isExpanded
          ? <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />
          : <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />}
      </button>

      {isExpanded && (
        <div className="px-6 pb-6 space-y-7 border-t border-border/50">
          {/* Alert banners */}
          <div className="space-y-3 pt-5">
            {pathway.alerts.map((alert, ai) => (
              <div key={ai} className={alertContainerClass(alert.variant)}>
                {alert.title && (
                  <p className="text-[11px] font-bold uppercase tracking-widest text-red-400 mb-2">{alert.title}</p>
                )}
                <p className={alertTextClass(alert.variant)}>{alert.content}</p>
              </div>
            ))}
          </div>

          {/* Steps */}
          <div className="space-y-8">
            {pathway.steps.map(({ step, title, criteriaCallout }) => {
              const stepOrders = pathway.orders.filter((o) => o.step === step);
              const stepChecked = stepOrders.filter((o) => checked.has(o.id)).length;
              return (
                <div key={step} className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/20 border border-primary/40 text-primary font-bold text-xs shrink-0">
                      {step}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Step {step}</p>
                      <p className="font-bold text-foreground text-sm leading-snug">{title}</p>
                    </div>
                    {stepChecked > 0 && (
                      <span className="text-xs text-primary font-bold bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full shrink-0">
                        {stepChecked}/{stepOrders.length}
                      </span>
                    )}
                  </div>

                  {criteriaCallout && (
                    <div className="ml-10 bg-amber-950/40 border border-amber-700/40 rounded-lg px-4 py-3">
                      <p className="text-xs text-amber-300/90 leading-relaxed">
                        <span className="font-bold text-amber-300">Criteria: </span>{criteriaCallout}
                      </p>
                    </div>
                  )}

                  <div className="ml-10 space-y-2">
                    {stepOrders.map((order) => {
                      const sel = checked.has(order.id);
                      return (
                        <button
                          key={order.id}
                          onClick={() => toggleCheck(order.id)}
                          className={["w-full flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all active:scale-[0.995]",
                            sel ? "bg-primary/10 border-primary/50 shadow-sm" : "bg-muted/20 border-border hover:border-primary/30 hover:bg-muted/40"].join(" ")}
                        >
                          <span className={["flex items-center justify-center w-5 h-5 rounded border-2 shrink-0 mt-0.5 transition-all",
                            sel ? "bg-primary border-primary" : "border-muted-foreground/40"].join(" ")}>
                            {sel && (
                              <svg className="w-3 h-3 text-primary-foreground" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className={["font-semibold text-sm leading-snug", sel ? "text-foreground" : "text-foreground/80"].join(" ")}>
                              {order.label}
                            </p>
                            <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{order.detail}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sign & Commit footer */}
          <div className="flex items-center gap-4 pt-5 border-t border-border/50">
            <p className="text-sm text-muted-foreground flex-1">
              {checkedCount > 0 ? `${checkedCount} of ${totalCount} orders selected` : "Select orders above to commit them"}
            </p>
            <button
              onClick={handleCommit}
              disabled={checkedCount === 0}
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm bg-primary hover:bg-primary/90 text-primary-foreground border-2 border-primary/60 shadow-md shadow-primary/20 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="w-4 h-4" />
              Sign &amp; Commit Selected Orders
            </button>
          </div>
        </div>
      )}

      {/* Copy-paste output — appears after commit */}
      {committedText && (
        <div className="border-t border-primary/20">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
            <div>
              <p className="font-bold text-sm text-foreground">Order Summary — Ready to Paste</p>
              <p className="text-xs text-muted-foreground mt-0.5">Copy and paste into an email, referral, or external EMR</p>
            </div>
            <button
              onClick={handleCopyText}
              className={["flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm border-2 transition-all active:scale-[0.97]",
                copied ? "bg-green-700/20 border-green-500 text-green-300" : "bg-primary/10 border-primary/40 text-primary hover:bg-primary/20"].join(" ")}
            >
              {copied ? <Check className="w-4 h-4" /> : <ClipboardList className="w-4 h-4" />}
              {copied ? "Copied!" : "Copy to Clipboard"}
            </button>
          </div>
          <textarea
            readOnly
            value={committedText}
            rows={Math.min(committedText.split("\n").length + 1, 20)}
            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
            className="w-full px-6 py-4 bg-transparent text-sm font-mono text-foreground/90 leading-relaxed resize-none focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}

function CarePathwaysView() {
  return (
    <div className="max-w-4xl mx-auto space-y-5 py-2">
      <div>
        <h2 className="text-xl font-bold text-foreground">📋 Standardized Care Pathways (Order Sets)</h2>
        <p className="text-sm text-muted-foreground mt-1">Evidence-based order sets for common LTC clinical scenarios — click a pathway to expand</p>
      </div>
      {ALL_PATHWAYS.map((p) => <PathwayCard key={p.id} pathway={p} />)}
    </div>
  );
}

// ── NLQ Search View ───────────────────────────────────────────────────────────

function NLQView({ residents }: { residents: ResidentAlertSummary[] }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<NLQResult>(null);
  const [searched, setSearched] = useState(false);

  const SUGGESTIONS = [
    "Who has not had an A1C in 1 year?",
    "Which residents have falls this year?",
    "Show residents on PRN laxatives",
    "Who is on antipsychotics?",
    "Residents with weight loss",
    "Show LDL cholesterol values",
  ];

  const search = (q = query) => {
    if (!q.trim()) return;
    setResult(processNLQ(q, residents.map(r => ({ residentId: r.residentId, name: r.name, room: r.room }))));
    setSearched(true);
  };

  return (
    <div className="space-y-6">
      {/* Big search bar */}
      <div className="relative">
        <div className="flex items-center gap-3 bg-card border-2 border-border rounded-2xl px-5 py-4 shadow-lg focus-within:border-primary/60 transition-colors">
          <Search className="w-6 h-6 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && search()}
            placeholder='Ask a clinical question, e.g. "Who has not had an A1C in 1 year?"'
            className="flex-1 bg-transparent text-lg text-foreground placeholder:text-muted-foreground focus:outline-none"
            autoFocus
          />
          {query && (
            <button onClick={() => { setQuery(""); setResult(null); setSearched(false); }}
              className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={() => search()}
            disabled={!query.trim()}
            className="px-5 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-40"
          >
            Search
          </button>
        </div>
      </div>

      {/* Suggestion chips */}
      {!searched && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">Try asking...</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => { setQuery(s); search(s); }}
                className="px-4 py-2 rounded-full border border-border bg-card hover:bg-muted text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">{result.label}</h3>
            <span className="text-xs text-muted-foreground font-mono">{result.rows.length} result{result.rows.length !== 1 ? "s" : ""}</span>
          </div>
          {result.rows.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground text-sm">
              No residents match this query.
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {result.columns.map(col => (
                      <th key={col} className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, i) => (
                    <tr key={row.residentId} className={["border-b border-border/40 hover:bg-muted/20 transition-colors", i % 2 === 0 ? "" : "bg-muted/10"].join(" ")}>
                      <td className="px-4 py-3 font-semibold text-foreground">{row.name}</td>
                      <td className="px-4 py-3 text-muted-foreground font-mono">
                        {row.room ? `Room ${row.room}` : "—"}
                      </td>
                      {row.values.map((v, vi) => (
                        <td key={vi} className="px-4 py-3 text-foreground">{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── QI Dashboard View ─────────────────────────────────────────────────────────

function QIView({ residents }: { residents: ResidentAlertSummary[] }) {
  const metrics = useMemo(
    () => getQIMetrics(residents.map(r => ({ residentId: r.residentId, name: r.name, room: r.room }))),
    [residents],
  );
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);

  const TrendIcon = ({ trend }: { trend: "up" | "down" | "stable" }) => {
    if (trend === "up") return <TrendingUp className="w-4 h-4 text-red-400" />;
    if (trend === "down") return <TrendingDown className="w-4 h-4 text-emerald-400" />;
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  };

  const trendLabel = { up: "Increasing", down: "Improving", stable: "Stable" };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground">Quality Improvement Dashboard</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time facility metrics — {residents.length} residents · <span className="text-primary">Click any row</span> to see affected residents
          </p>
        </div>
        <span className="text-xs font-mono text-muted-foreground bg-muted/40 px-3 py-1.5 rounded-lg border border-border">
          Updated {new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-6 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Metric</th>
              <th className="text-center px-4 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Total</th>
              <th className="text-center px-4 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">High-Risk Flags</th>
              <th className="text-center px-4 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">% Affected</th>
              <th className="text-center px-4 py-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Trend</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((m, i) => {
              const pct = residents.length > 0 ? Math.round((m.total / residents.length) * 100) : 0;
              const riskPct = m.total > 0 ? Math.round((m.highRisk / m.total) * 100) : 0;
              const isOpen = expandedMetric === m.metric;
              return (
                <Fragment key={m.metric}>
                  <tr
                    onClick={() => setExpandedMetric(isOpen ? null : m.metric)}
                    className={["border-b border-border/40 cursor-pointer select-none transition-colors",
                      isOpen ? "bg-primary/5" : i % 2 === 0 ? "hover:bg-muted/20" : "bg-muted/10 hover:bg-muted/25"].join(" ")}
                  >
                    <td className="px-6 py-4 font-semibold text-foreground">
                      <div className="flex items-center gap-2">
                        {isOpen
                          ? <ChevronDown className="w-3.5 h-3.5 text-primary shrink-0" />
                          : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />}
                        {m.metric}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={["text-2xl font-bold", m.total > 0 ? "text-foreground" : "text-muted-foreground"].join(" ")}>{m.total}</span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={["text-lg font-bold", m.highRisk > 3 ? "text-red-400" : m.highRisk > 1 ? "text-amber-400" : "text-emerald-400"].join(" ")}>
                        {m.highRisk}
                      </span>
                      {m.highRisk > 0 && <span className="text-xs text-muted-foreground ml-1">({riskPct}%)</span>}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={["h-full rounded-full", pct > 30 ? "bg-red-500" : pct > 15 ? "bg-amber-500" : "bg-emerald-500"].join(" ")}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono text-muted-foreground w-8">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <TrendIcon trend={m.trend} />
                        <span className="text-xs text-muted-foreground">{trendLabel[m.trend]}</span>
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-primary/5 border-b border-primary/10">
                      <td colSpan={5} className="px-6 py-4">
                        {m.residents.length === 0 ? (
                          <p className="text-sm text-muted-foreground italic">No residents currently flagged for this metric.</p>
                        ) : (
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-widest text-primary mb-3">
                              {m.residents.length} resident{m.residents.length !== 1 ? "s" : ""} flagged
                            </p>
                            <div className="grid gap-1.5">
                              {m.residents.map((r, ri) => (
                                <div key={ri} className="flex items-center gap-3 bg-muted/30 rounded-lg px-4 py-2.5 border border-border/50">
                                  <span className="text-xs font-mono font-bold text-muted-foreground bg-muted/60 px-2 py-0.5 rounded shrink-0">
                                    Rm {r.room}
                                  </span>
                                  <span className="font-semibold text-sm text-foreground min-w-[160px]">{r.name}</span>
                                  <span className="text-xs text-muted-foreground ml-auto text-right">{r.detail}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Data is based on events logged in the past 14–365 days depending on metric. High-risk flags indicate residents requiring immediate clinical review.
      </p>
    </div>
  );
}

// ── Virtual Health View ───────────────────────────────────────────────────────

function VirtualHealthView() {
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [callActive, setCallActive] = useState(true);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!callActive) return;
    const t = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [callActive]);

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const participants = [
    { label: "Dr. Sarah Chang", role: "Attending Physician", img: "https://i.pravatar.cc/300?img=49", self: true },
    { label: "Margaret Chen", role: "Patient · Room 101", img: "https://i.pravatar.cc/300?img=1", self: false },
    { label: "Interpreter (French)", role: "Language Services", img: "https://i.pravatar.cc/300?img=33", self: false },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground">Virtual Health Consultation</h2>
          <p className="text-xs text-muted-foreground mt-0.5">3-way video session — mock UI</p>
        </div>
        {callActive && (
          <div className="flex items-center gap-2 bg-red-900/30 border border-red-500/40 px-4 py-2 rounded-full">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm font-bold text-red-300 font-mono">{formatElapsed(elapsed)}</span>
          </div>
        )}
      </div>

      {/* Video grid */}
      <div className="grid grid-cols-3 gap-4">
        {participants.map((p, i) => (
          <div key={i} className={["relative rounded-2xl overflow-hidden aspect-video border-2 shadow-xl",
            p.self ? "border-primary" : "border-border"].join(" ")}>
            <img src={p.img} alt={p.label} className="w-full h-full object-cover" style={{ filter: cameraOff && p.self ? "brightness(0.1)" : "none" }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 px-4 py-3">
              <p className="text-sm font-bold text-white">{p.label}</p>
              <p className="text-xs text-white/70">{p.role}</p>
            </div>
            {p.self && cameraOff && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                <VideoOff className="w-10 h-10 text-muted-foreground" />
              </div>
            )}
            {p.self && <span className="absolute top-3 right-3 text-[10px] font-bold bg-primary/90 text-primary-foreground px-2 py-0.5 rounded-full">YOU</span>}
          </div>
        ))}
      </div>

      {/* Controls */}
      {callActive ? (
        <div className="flex items-center justify-center gap-4">
          <button onClick={() => setMuted(m => !m)}
            className={["w-14 h-14 rounded-full border-2 flex items-center justify-center transition-colors",
              muted ? "bg-red-900/40 border-red-500/60 text-red-400" : "bg-muted border-border text-muted-foreground hover:bg-muted/80"].join(" ")}>
            {muted ? <VideoOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>
          <button onClick={() => setCameraOff(c => !c)}
            className={["w-14 h-14 rounded-full border-2 flex items-center justify-center transition-colors",
              cameraOff ? "bg-red-900/40 border-red-500/60 text-red-400" : "bg-muted border-border text-muted-foreground hover:bg-muted/80"].join(" ")}>
            {cameraOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
          </button>
          <button onClick={() => setCallActive(false)}
            className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 border-2 border-red-400 flex items-center justify-center transition-colors shadow-lg">
            <PhoneOff className="w-7 h-7 text-white" />
          </button>
          <button className="w-14 h-14 rounded-full border-2 border-border bg-muted text-muted-foreground flex items-center justify-center hover:bg-muted/80 transition-colors">
            <Users className="w-6 h-6" />
          </button>
          <button className="w-14 h-14 rounded-full border-2 border-border bg-muted text-muted-foreground flex items-center justify-center hover:bg-muted/80 transition-colors">
            <MessageCircle className="w-6 h-6" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 py-8">
          <p className="text-lg font-bold text-muted-foreground">Call Ended — {formatElapsed(elapsed)}</p>
          <button onClick={() => { setCallActive(true); setElapsed(0); }}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors">
            <Video className="w-4 h-4" />
            Start New Call
          </button>
        </div>
      )}

      <p className="text-xs text-center text-muted-foreground/50">
        This is a mock interface for demonstration. Real video calls would be powered by a WebRTC integration.
      </p>
    </div>
  );
}

// ── Family Q&A View (Physician Receives Forwarded Questions) ──────────────────

function FamilyQAView() {
  const [questions, setQuestions] = useState<FamilyQuestion[]>([]);
  const { toast } = useToast();

  const reload = () => setQuestions(getFamilyQuestions().filter(q => q.status === "forwarded"));

  useEffect(() => { reload(); }, []);

  const resolve = (id: string) => {
    const qs = getFamilyQuestions().map(q => q.id === id ? { ...q, status: "archived" as const } : q);
    saveFamilyQuestions(qs);
    reload();
    toast({ title: "Question Resolved", description: "Marked as addressed and archived." });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground">Family Questions — Forwarded for Physician Review</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Questions submitted by families and forwarded by frontline staff</p>
        </div>
        <button onClick={reload} className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 border border-border rounded-lg hover:bg-muted transition-colors">
          Refresh
        </button>
      </div>

      {questions.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center space-y-2">
          <MessageCircle className="w-8 h-8 text-muted-foreground/30 mx-auto" />
          <p className="text-muted-foreground text-sm">No forwarded questions at this time.</p>
          <p className="text-xs text-muted-foreground/60">Questions forwarded by frontline staff will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map(q => (
            <div key={q.id} className="rounded-xl border border-sky-500/20 bg-sky-900/10 p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-foreground">{q.residentName} · <span className="font-normal text-muted-foreground">Room {q.residentId - 5}</span></p>
                  <p className="text-xs text-sky-400 mt-0.5">From: {q.familyName}</p>
                </div>
                <p className="text-xs font-mono text-muted-foreground shrink-0">
                  {new Date(q.date).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}
                </p>
              </div>
              <p className="text-sm text-foreground/85 leading-relaxed border-l-2 border-sky-500/40 pl-4">{q.question}</p>
              <button
                onClick={() => resolve(q.id)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-900/30 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-900/50 text-xs font-bold transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Mark Addressed &amp; Archive
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Frontline Family Binder (used in Frontline Staff view) ────────────────────

export function FrontlineCommBinder() {
  const [questions, setQuestions] = useState<FamilyQuestion[]>([]);
  const { toast } = useToast();

  const reload = () => setQuestions(getFamilyQuestions().filter(q => q.status === "pending"));

  useEffect(() => { reload(); }, []);

  const archive = (id: string) => {
    const qs = getFamilyQuestions().map(q => q.id === id ? { ...q, status: "archived" as const } : q);
    saveFamilyQuestions(qs);
    reload();
    toast({ title: "Archived", description: "Question removed from binder." });
  };

  const forward = (id: string) => {
    const qs = getFamilyQuestions().map(q => q.id === id ? { ...q, status: "forwarded" as const } : q);
    saveFamilyQuestions(qs);
    reload();
    toast({ title: "Forwarded to Physician", description: "Question will appear in the Physician Family Q&A tab." });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 bg-card border-b border-border px-6 py-4 shadow-sm">
        <h1 className="text-base font-bold">Family Communication Binder</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Questions submitted by families — review and forward to physician as needed</p>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-6 space-y-4">
        {questions.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center space-y-2">
            <MessageCircle className="w-8 h-8 text-muted-foreground/30 mx-auto" />
            <p className="text-muted-foreground text-sm">No pending family questions.</p>
            <p className="text-xs text-muted-foreground/60">New questions submitted by families will appear here.</p>
          </div>
        ) : (
          questions.map(q => (
            <div key={q.id} className="rounded-xl border border-border bg-card p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-foreground">{q.residentName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">From: {q.familyName}</p>
                </div>
                <p className="text-xs font-mono text-muted-foreground shrink-0">
                  {new Date(q.date).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}
                </p>
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed">{q.question}</p>
              <div className="flex gap-2">
                <button onClick={() => forward(q.id)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-900/30 text-sky-400 border border-sky-500/30 hover:bg-sky-900/50 text-xs font-bold transition-colors">
                  <Send className="w-3.5 h-3.5" />
                  Forward to Physician
                </button>
                <button onClick={() => archive(q.id)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-muted text-muted-foreground border border-border hover:bg-muted/80 text-xs font-semibold transition-colors">
                  Archive
                </button>
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  );
}

// ── Clinical Forms View ───────────────────────────────────────────────────────

type ClinicalFormType = "admission" | "codestatus" | "ppo";

interface SignatureRecord {
  physicianName: string;
  designation: string;
  signedAt: string;
}

function SignedBadge({ sig, onEdit }: { sig: SignatureRecord; onEdit: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-emerald-950/40 border border-emerald-700/50 px-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
        <div>
          <p className="text-xs font-bold text-emerald-300">Signed &amp; Locked</p>
          <p className="text-xs text-emerald-400/70 mt-0.5">
            {sig.physicianName}{sig.designation ? `, ${sig.designation}` : ""} &mdash;{" "}
            {new Date(sig.signedAt).toLocaleString("en-CA", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      </div>
      <button
        onClick={onEdit}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-700/50 text-emerald-400 hover:bg-emerald-950/60 text-xs font-bold transition-colors shrink-0"
      >
        <Pencil className="w-3 h-3" />
        Edit &amp; Unlock
      </button>
    </div>
  );
}

function SignaturePanel({ onSign }: { onSign: (name: string, designation: string) => void }) {
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  return (
    <div className="rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-5 space-y-4">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
        <UserCheck className="w-3.5 h-3.5 text-primary" /> Physician Signature
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70">Full Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Dr. Full Name"
            className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70">Designation</label>
          <input
            type="text"
            value={designation}
            onChange={(e) => setDesignation(e.target.value)}
            placeholder="e.g. MD, CCFP, Geriatrician"
            className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>
      <button
        onClick={() => { if (name.trim()) onSign(name.trim(), designation.trim()); }}
        disabled={!name.trim()}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
      >
        <Save className="w-4 h-4" />
        Sign &amp; Lock Order
      </button>
    </div>
  );
}

function OptionChip({ label, active, locked, onClick, activeClass }: {
  label: string; active: boolean; locked: boolean; onClick: () => void; activeClass?: string;
}) {
  return (
    <button
      disabled={locked}
      onClick={onClick}
      className={[
        "px-4 py-2 rounded-xl border-2 text-sm font-semibold transition-all",
        active
          ? (activeClass ?? "bg-primary/20 border-primary text-primary shadow-sm")
          : "bg-card border-border text-foreground hover:border-primary/40",
        locked ? "opacity-70 cursor-default" : "",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

// ─── Admission Orders ──────────────────────────────────────────────────────────

const ACTIVITY_OPTIONS = ["Bedrest", "Bedrest with Bathroom Privileges", "Chair", "Ambulatory with Assist", "Independent"];
const DIET_OPTIONS    = ["Regular", "Soft", "Minced", "Pureed", "Thickened — Nectar", "Thickened — Honey", "NPO", "PEG Tube"];
const FLUID_OPTIONS   = ["No Restriction", "1000 mL/day", "1200 mL/day", "1500 mL/day"];
const VITALS_OPTIONS  = ["Daily", "BID", "TID", "Weekly", "PRN Only"];
const O2_OPTIONS      = ["None", "PRN", "Continuous"];

interface AdmissionData {
  activity: string; diet: string; fluidRestriction: string; vitalsFreq: string;
  fallPrecautions: string; o2Order: string; o2FlowRate: string; woundCare: string; specialInstructions: string;
}
const defaultAdmission: AdmissionData = {
  activity: "", diet: "", fluidRestriction: "No Restriction", vitalsFreq: "Daily",
  fallPrecautions: "", o2Order: "None", o2FlowRate: "", woundCare: "", specialInstructions: "",
};

function AdmissionOrdersForm({ residentName }: { residentName: string }) {
  const { toast } = useToast();
  const [sig, setSig] = useState<SignatureRecord | null>(null);
  const [d, setD] = useState<AdmissionData>(defaultAdmission);
  const locked = sig !== null;
  const set = (patch: Partial<AdmissionData>) => { if (!locked) setD((p) => ({ ...p, ...patch })); };

  const sectionLabel = (icon: ReactNode, text: string) => (
    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
      {icon}{text}
    </p>
  );

  return (
    <div className="space-y-7">
      {sig && <SignedBadge sig={sig} onEdit={() => setSig(null)} />}

      <div className="space-y-2">
        {sectionLabel(<Activity className="w-3.5 h-3.5 text-blue-400" />, "Activity Level")}
        <div className="flex flex-wrap gap-2">
          {ACTIVITY_OPTIONS.map((o) => (
            <OptionChip key={o} label={o} active={d.activity === o} locked={locked}
              onClick={() => set({ activity: d.activity === o ? "" : o })} />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {sectionLabel(<ClipboardList className="w-3.5 h-3.5 text-amber-400" />, "Diet Order")}
        <div className="flex flex-wrap gap-2">
          {DIET_OPTIONS.map((o) => (
            <OptionChip key={o} label={o} active={d.diet === o} locked={locked}
              onClick={() => set({ diet: d.diet === o ? "" : o })} />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {sectionLabel(<Droplets className="w-3.5 h-3.5 text-sky-400" />, "Fluid Restriction")}
        <div className="flex flex-wrap gap-2">
          {FLUID_OPTIONS.map((o) => (
            <OptionChip key={o} label={o} active={d.fluidRestriction === o} locked={locked}
              onClick={() => set({ fluidRestriction: d.fluidRestriction === o ? "" : o })} />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {sectionLabel(<Activity className="w-3.5 h-3.5 text-emerald-400" />, "Vital Signs Frequency")}
        <div className="flex flex-wrap gap-2">
          {VITALS_OPTIONS.map((o) => (
            <OptionChip key={o} label={o} active={d.vitalsFreq === o} locked={locked}
              onClick={() => set({ vitalsFreq: d.vitalsFreq === o ? "" : o })} />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {sectionLabel(<AlertTriangle className="w-3.5 h-3.5 text-amber-400" />, "Fall Precautions")}
        <div className="flex gap-3">
          {([
            ["Yes — Precautions Active", "bg-amber-700/40 border-amber-400 text-amber-200"],
            ["No — Routine Only",         "bg-slate-600/30 border-slate-400 text-slate-200"],
          ] as const).map(([label, activeCls]) => (
            <button
              key={label}
              disabled={locked}
              onClick={() => set({ fallPrecautions: d.fallPrecautions === label ? "" : label })}
              className={[
                "flex-1 py-3 rounded-xl border-2 text-sm font-bold transition-all",
                d.fallPrecautions === label ? activeCls : "bg-card border-border text-foreground hover:border-primary/40",
                locked ? "opacity-70 cursor-default" : "",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {sectionLabel(<TrendingUp className="w-3.5 h-3.5 text-sky-400" />, "Oxygen Order")}
        <div className="flex flex-wrap gap-2">
          {O2_OPTIONS.map((o) => (
            <OptionChip key={o} label={o} active={d.o2Order === o} locked={locked}
              onClick={() => set({ o2Order: d.o2Order === o ? "" : o })} />
          ))}
        </div>
        {d.o2Order !== "None" && d.o2Order !== "" && (
          <div className="flex items-center gap-3 mt-2">
            <label className="text-xs text-muted-foreground font-semibold whitespace-nowrap">Flow rate:</label>
            <input
              type="text"
              value={d.o2FlowRate}
              onChange={(e) => set({ o2FlowRate: e.target.value })}
              disabled={locked}
              placeholder="e.g. 2 L/min via nasal cannula"
              className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-70"
            />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Wound / Skin Care Orders</p>
        <textarea
          value={d.woundCare}
          onChange={(e) => set({ woundCare: e.target.value })}
          disabled={locked}
          rows={3}
          placeholder="Wound care protocol, dressing orders, repositioning schedule…"
          className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none leading-relaxed disabled:opacity-70"
        />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Special Instructions</p>
        <textarea
          value={d.specialInstructions}
          onChange={(e) => set({ specialInstructions: e.target.value })}
          disabled={locked}
          rows={3}
          placeholder="Isolation precautions, monitoring requirements, consults ordered…"
          className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none leading-relaxed disabled:opacity-70"
        />
      </div>

      {!locked && (
        <SignaturePanel
          onSign={(name, desig) => {
            setSig({ physicianName: name, designation: desig, signedAt: new Date().toISOString() });
            toast({ title: "Admission Orders Signed", description: `Signed by ${name} for ${residentName}` });
          }}
        />
      )}
    </div>
  );
}

// ─── Code Status Form ──────────────────────────────────────────────────────────

const CODE_STATUS_OPTIONS = ["Full Code", "DNR", "DNH", "DNR / DNH", "Comfort Measures Only", "No CPR / No Intubation"];
const SDM_OPTIONS = ["Yes — SDM Agrees", "No — SDM Declines", "N/A — No SDM on File"];

interface CodeStatusData {
  codeStatus: string; polstCompleted: string; effectiveDate: string;
  sdmAgrees: string; witnessName: string; notes: string;
}
const defaultCodeStatus: CodeStatusData = {
  codeStatus: "", polstCompleted: "", effectiveDate: new Date().toISOString().slice(0, 10),
  sdmAgrees: "", witnessName: "", notes: "",
};

function CodeStatusForm({ residentName }: { residentName: string }) {
  const { toast } = useToast();
  const [sig, setSig] = useState<SignatureRecord | null>(null);
  const [d, setD] = useState<CodeStatusData>(defaultCodeStatus);
  const locked = sig !== null;
  const set = (patch: Partial<CodeStatusData>) => { if (!locked) setD((p) => ({ ...p, ...patch })); };

  return (
    <div className="space-y-7">
      {sig && <SignedBadge sig={sig} onEdit={() => setSig(null)} />}

      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-purple-400" /> Code Status
        </p>
        <div className="flex flex-wrap gap-2">
          {CODE_STATUS_OPTIONS.map((o) => (
            <OptionChip
              key={o}
              label={o}
              active={d.codeStatus === o}
              locked={locked}
              activeClass="bg-purple-800/40 border-purple-400 text-purple-200 shadow-sm"
              onClick={() => set({ codeStatus: d.codeStatus === o ? "" : o })}
            />
          ))}
        </div>
        {d.codeStatus && (
          <div className={[
            "mt-2 rounded-xl border px-4 py-3 text-sm font-semibold",
            ["Full Code"].includes(d.codeStatus)
              ? "bg-emerald-950/40 border-emerald-700/50 text-emerald-300"
              : ["Comfort Measures Only", "No CPR / No Intubation"].includes(d.codeStatus)
              ? "bg-red-950/40 border-red-700/50 text-red-300"
              : "bg-amber-950/40 border-amber-700/50 text-amber-300",
          ].join(" ")}>
            {d.codeStatus === "Full Code" && "All resuscitative measures to be attempted."}
            {d.codeStatus === "DNR" && "Do Not Resuscitate — no CPR if cardiac arrest."}
            {d.codeStatus === "DNH" && "Do Not Hospitalize — comfort care at facility."}
            {d.codeStatus === "DNR / DNH" && "No CPR and no hospital transfer — comfort at facility."}
            {d.codeStatus === "Comfort Measures Only" && "Comfort-focused care only. No life-prolonging interventions."}
            {d.codeStatus === "No CPR / No Intubation" && "No cardiopulmonary resuscitation or mechanical ventilation."}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">POLST Completed</p>
          <div className="flex gap-2">
            {["Yes", "No"].map((o) => (
              <button
                key={o}
                disabled={locked}
                onClick={() => set({ polstCompleted: d.polstCompleted === o ? "" : o })}
                className={[
                  "flex-1 py-2.5 rounded-xl border-2 text-sm font-bold transition-all",
                  d.polstCompleted === o
                    ? o === "Yes" ? "bg-emerald-700/40 border-emerald-400 text-emerald-200" : "bg-red-800/40 border-red-400 text-red-200"
                    : "bg-card border-border text-foreground hover:border-primary/40",
                  locked ? "opacity-70 cursor-default" : "",
                ].join(" ")}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Effective Date</p>
          <input
            type="date"
            value={d.effectiveDate}
            onChange={(e) => set({ effectiveDate: e.target.value })}
            disabled={locked}
            className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-70"
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
          <UserCheck className="w-3.5 h-3.5 text-primary" /> SDM Agreement
        </p>
        <div className="flex flex-wrap gap-2">
          {SDM_OPTIONS.map((o) => (
            <OptionChip key={o} label={o} active={d.sdmAgrees === o} locked={locked}
              onClick={() => set({ sdmAgrees: d.sdmAgrees === o ? "" : o })} />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Witness Name &amp; Role</p>
        <input
          type="text"
          value={d.witnessName}
          onChange={(e) => set({ witnessName: e.target.value })}
          disabled={locked}
          placeholder="e.g. Jane Smith RN — Charge Nurse"
          className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-70"
        />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Clinical Notes</p>
        <textarea
          value={d.notes}
          onChange={(e) => set({ notes: e.target.value })}
          disabled={locked}
          rows={3}
          placeholder="Goals of care discussion summary, SDM contact, context for this decision…"
          className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none leading-relaxed disabled:opacity-70"
        />
      </div>

      {!locked && (
        <SignaturePanel
          onSign={(name, desig) => {
            setSig({ physicianName: name, designation: desig, signedAt: new Date().toISOString() });
            toast({ title: "Code Status Order Signed", description: `${d.codeStatus || "Order"} signed by ${name} for ${residentName}` });
          }}
        />
      )}
    </div>
  );
}

// ─── Physician Periodic Orders (PPO) ──────────────────────────────────────────

interface PPOData {
  routineMeds: string; prnMeds: string; monitoring: string;
  labOrders: string; followUpDate: string; renewalDate: string; specialInstructions: string;
}
const defaultPPO: PPOData = {
  routineMeds: "", prnMeds: "", monitoring: "", labOrders: "",
  followUpDate: "", renewalDate: "", specialInstructions: "",
};

function PPOForm({ residentName }: { residentName: string }) {
  const { toast } = useToast();
  const [sig, setSig] = useState<SignatureRecord | null>(null);
  const [d, setD] = useState<PPOData>(defaultPPO);
  const locked = sig !== null;
  const set = (patch: Partial<PPOData>) => { if (!locked) setD((p) => ({ ...p, ...patch })); };

  const areaCls = "w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none leading-relaxed disabled:opacity-70";
  const inpCls  = "w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-70";
  const lbl     = "text-xs font-bold uppercase tracking-widest text-muted-foreground";

  return (
    <div className="space-y-6">
      {sig && <SignedBadge sig={sig} onEdit={() => setSig(null)} />}

      <div className="space-y-2">
        <p className={lbl}>Routine Medications</p>
        <textarea value={d.routineMeds} onChange={(e) => set({ routineMeds: e.target.value })} disabled={locked} rows={5}
          placeholder={"Metformin 500 mg PO BID\nLisinopril 5 mg PO daily\nCalcium + D3 1200 mg PO daily\nLevothyroxine 50 mcg PO daily AC"}
          className={areaCls} />
      </div>

      <div className="space-y-2">
        <p className={lbl}>PRN Medications</p>
        <textarea value={d.prnMeds} onChange={(e) => set({ prnMeds: e.target.value })} disabled={locked} rows={4}
          placeholder={"Acetaminophen 500 mg PO q4h PRN pain (max 3 g/day)\nHaloperidol 0.5 mg PO PRN agitation q6h\nLactulose 30 mL PO PRN constipation (max 1×/day)"}
          className={areaCls} />
      </div>

      <div className="space-y-2">
        <p className={lbl}>Monitoring Orders</p>
        <textarea value={d.monitoring} onChange={(e) => set({ monitoring: e.target.value })} disabled={locked} rows={3}
          placeholder={"Weight weekly\nFluid balance daily\nBlood glucose AC+HS"}
          className={areaCls} />
      </div>

      <div className="space-y-2">
        <p className={lbl}>Lab Orders</p>
        <textarea value={d.labOrders} onChange={(e) => set({ labOrders: e.target.value })} disabled={locked} rows={2}
          placeholder={"CBC, BMP — monthly\nHbA1c — q3 months\nINR weekly (if on warfarin)"}
          className={areaCls} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <p className={lbl}>Follow-Up Date</p>
          <input type="date" value={d.followUpDate} onChange={(e) => set({ followUpDate: e.target.value })} disabled={locked} className={inpCls} />
        </div>
        <div className="space-y-2">
          <p className={lbl}>Order Renewal Date</p>
          <input type="date" value={d.renewalDate} onChange={(e) => set({ renewalDate: e.target.value })} disabled={locked} className={inpCls} />
        </div>
      </div>

      <div className="space-y-2">
        <p className={lbl}>Special Instructions</p>
        <textarea value={d.specialInstructions} onChange={(e) => set({ specialInstructions: e.target.value })} disabled={locked} rows={3}
          placeholder="Allergy cross-references, specific timing notes, exceptions, cross-coverage instructions…"
          className={areaCls} />
      </div>

      {!locked && (
        <SignaturePanel
          onSign={(name, desig) => {
            setSig({ physicianName: name, designation: desig, signedAt: new Date().toISOString() });
            toast({ title: "PPO Signed", description: `Periodic Physician Orders signed by ${name} for ${residentName}` });
          }}
        />
      )}
    </div>
  );
}

// ─── Main ClinicalFormsView ────────────────────────────────────────────────────

function ClinicalFormsView() {
  const { data: residents = [] } = useListResidents({ query: { queryKey: getListResidentsQueryKey() } });
  const [selectedResidentId, setSelectedResidentId] = useState<number | null>(null);
  const [formType, setFormType] = useState<ClinicalFormType>("admission");
  const selectedResident = residents.find((r) => r.id === selectedResidentId);

  const FORM_TABS: { id: ClinicalFormType; label: string }[] = [
    { id: "admission",  label: "Admission Orders" },
    { id: "codestatus", label: "Code Status" },
    { id: "ppo",        label: "Periodic Orders (PPO)" },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-foreground">Clinical Forms</h2>
        <p className="text-sm text-muted-foreground">Select a resident and form type to complete, edit, and sign.</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Resident</p>
        <select
          value={selectedResidentId ?? ""}
          onChange={(e) => { setSelectedResidentId(e.target.value ? Number(e.target.value) : null); }}
          className="w-full bg-card border-2 border-border rounded-xl px-4 py-3 text-foreground focus:outline-none focus:border-primary/60 text-sm appearance-none"
        >
          <option value="" className="bg-card">— Select a resident —</option>
          {residents.map((r) => (
            <option key={r.id} value={r.id} className="bg-card">
              {r.name} — Room {r.room}
            </option>
          ))}
        </select>
      </div>

      {selectedResident ? (
        <>
          <div className="flex items-center gap-4 rounded-xl bg-card border border-border px-4 py-3">
            <img
              src={`https://i.pravatar.cc/60?img=${((selectedResident.id - 6) % 70) + 1}`}
              alt=""
              className="w-12 h-12 rounded-xl object-cover shrink-0 border border-border"
            />
            <div>
              <p className="font-bold text-foreground">{selectedResident.name}</p>
              <p className="text-xs text-muted-foreground">Room {selectedResident.room}</p>
            </div>
          </div>

          <div className="flex gap-1.5 bg-muted/30 rounded-xl p-1.5">
            {FORM_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFormType(tab.id)}
                className={[
                  "flex-1 py-2.5 rounded-lg text-xs font-bold transition-all",
                  formType === tab.id
                    ? "bg-card text-foreground shadow-sm border border-border/60"
                    : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="bg-card rounded-2xl border border-border p-6">
            <div className="mb-6 pb-5 border-b border-border/60">
              <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/60">
                {FORM_TABS.find((t) => t.id === formType)?.label}
              </p>
              <p className="text-base font-bold text-foreground mt-0.5">{selectedResident.name}</p>
              <p className="text-xs text-muted-foreground">Room {selectedResident.room}</p>
            </div>
            {formType === "admission"  && <AdmissionOrdersForm key={`admission-${selectedResident.id}`}  residentName={selectedResident.name} />}
            {formType === "codestatus" && <CodeStatusForm      key={`codestatus-${selectedResident.id}`} residentName={selectedResident.name} />}
            {formType === "ppo"        && <PPOForm             key={`ppo-${selectedResident.id}`}        residentName={selectedResident.name} />}
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-16 text-center space-y-3">
          <ClipboardList className="w-10 h-10 text-muted-foreground/30 mx-auto" />
          <p className="text-muted-foreground font-medium">Select a resident to begin</p>
          <p className="text-xs text-muted-foreground/60">Choose from the dropdown above to open their clinical forms.</p>
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function PhysicianDashboard() {
  const [time, setTime] = useState(new Date());
  const [selectedResident, setSelectedResident] = useState<ResidentAlertSummary | null>(null);
  const [view, setView] = useState<"population" | "binder" | "directory" | "cpoe" | "nlq" | "qi" | "virtual" | "forms" | "pathways">("population");
  const [overlayResident, setOverlayResident] = useState<ResidentAlertSummary | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("alertLevel");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [physFavs, setPhysFavs] = useState<Set<number>>(() => loadPhysFavs());
  const [physFilter, setPhysFilter] = useState<"all" | "mine">("all");

  const togglePhysFav = useCallback((residentId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setPhysFavs((prev) => {
      const next = new Set(prev);
      if (next.has(residentId)) next.delete(residentId); else next.add(residentId);
      savePhysFavs(next);
      return next;
    });
  }, []);

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      else { setSortDir("desc"); }
      return key;
    });
  }, []);

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

  const sortedResidents = useMemo(() => {
    if (!data) return [];
    const dir = sortDir === "asc" ? 1 : -1;
    const sorted = [...data.residents].sort((a, b) => {
      switch (sortKey) {
        case "alertLevel": return dir * (alertScore(a) - alertScore(b));
        case "lastName":   return dir * parseName(a.name).lastName.localeCompare(parseName(b.name).lastName);
        case "firstName":  return dir * parseName(a.name).firstName.localeCompare(parseName(b.name).firstName);
        case "room":       return dir * a.room.localeCompare(b.room, undefined, { numeric: true });
        case "lastBM": {
          const ah = a.hoursSinceLastBM ?? Infinity;
          const bh = b.hoursSinceLastBM ?? Infinity;
          return dir * (ah - bh);
        }
        case "gaps":   return dir * (a.monthlyGapCount - b.monthlyGapCount);
        case "blood":  return dir * (a.monthlyBloodCount - b.monthlyBloodCount);
        case "alerts": return dir * (clinicalAlertCount(a) - clinicalAlertCount(b));
        case "mrp":    return dir * getMRP(a.residentId).localeCompare(getMRP(b.residentId));
        default: return 0;
      }
    });
    if (physFilter === "mine") return sorted.filter((r) => physFavs.has(r.residentId));
    return sorted;
  }, [data, sortKey, sortDir, physFilter, physFavs]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-card border-b border-border px-6 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <span className="font-bold text-lg text-foreground">Physician View</span>
          <span className="text-muted-foreground text-sm">— Residents</span>
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
        <div className="max-w-7xl mx-auto flex flex-wrap gap-2">
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
            Residents
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
          <button
            onClick={() => setView("directory")}
            className={[
              "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm border-2 transition-all",
              view === "directory"
                ? "bg-teal-700/20 border-teal-500 text-teal-300 shadow-sm"
                : "bg-card border-border text-muted-foreground hover:border-teal-500/40",
            ].join(" ")}
          >
            <Send className="w-4 h-4" />
            Comm Hub
          </button>
          <button
            onClick={() => setView("cpoe")}
            className={[
              "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm border-2 transition-all",
              view === "cpoe"
                ? "bg-violet-700/20 border-violet-500 text-violet-300 shadow-sm"
                : "bg-card border-border text-muted-foreground hover:border-violet-500/40",
            ].join(" ")}
          >
            <Stethoscope className="w-4 h-4" />
            CPOE
          </button>
          <button
            onClick={() => setView("nlq")}
            className={[
              "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm border-2 transition-all",
              view === "nlq"
                ? "bg-cyan-700/20 border-cyan-500 text-cyan-300 shadow-sm"
                : "bg-card border-border text-muted-foreground hover:border-cyan-500/40",
            ].join(" ")}
          >
            <Search className="w-4 h-4" />
            NLQ Search
          </button>
          <button
            onClick={() => setView("qi")}
            className={[
              "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm border-2 transition-all",
              view === "qi"
                ? "bg-emerald-700/20 border-emerald-500 text-emerald-300 shadow-sm"
                : "bg-card border-border text-muted-foreground hover:border-emerald-500/40",
            ].join(" ")}
          >
            <TrendingUp className="w-4 h-4" />
            QI Dashboard
          </button>
          <button
            onClick={() => setView("virtual")}
            className={[
              "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm border-2 transition-all",
              view === "virtual"
                ? "bg-blue-700/20 border-blue-500 text-blue-300 shadow-sm"
                : "bg-card border-border text-muted-foreground hover:border-blue-500/40",
            ].join(" ")}
          >
            <Video className="w-4 h-4" />
            Virtual Health
          </button>
          <button
            onClick={() => setView("forms")}
            className={[
              "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm border-2 transition-all",
              view === "forms"
                ? "bg-rose-700/20 border-rose-500 text-rose-300 shadow-sm"
                : "bg-card border-border text-muted-foreground hover:border-rose-500/40",
            ].join(" ")}
          >
            <ClipboardList className="w-4 h-4" />
            Clinical Forms
          </button>
          <button
            onClick={() => setView("pathways")}
            className={[
              "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm border-2 transition-all",
              view === "pathways"
                ? "bg-amber-700/20 border-amber-500 text-amber-300 shadow-sm"
                : "bg-card border-border text-muted-foreground hover:border-amber-500/40",
            ].join(" ")}
          >
            <FileText className="w-4 h-4" />
            Order Sets
          </button>
        </div>
      </div>

      <main className="max-w-7xl mx-auto p-8 space-y-8">
        {view === "binder" && <VirtualBinder />}
        {view === "directory" && <CommHubView />}
        {view === "cpoe" && <OrderHub />}
        {view === "nlq" && data && <NLQView residents={data.residents} />}
        {view === "qi" && data && <QIView residents={data.residents} />}
        {view === "virtual" && <VirtualHealthView />}
        {view === "forms"     && <ClinicalFormsView />}
        {view === "pathways" && <CarePathwaysView />}

        {/* Resident Summary Table */}
        {view === "population" && <section className="space-y-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPhysFilter("all")}
                className={["px-4 py-1.5 rounded-lg text-xs font-bold border-2 transition-all", physFilter === "all" ? "bg-primary/15 border-primary text-primary" : "bg-card border-border text-muted-foreground hover:border-primary/40"].join(" ")}
              >
                All Residents {data ? `(${data.residents.length})` : ""}
              </button>
              <button
                onClick={() => setPhysFilter("mine")}
                className={["flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold border-2 transition-all", physFilter === "mine" ? "bg-amber-700/20 border-amber-500 text-amber-300" : "bg-card border-border text-muted-foreground hover:border-amber-500/40"].join(" ")}
              >
                <Star className={["w-3 h-3", physFilter === "mine" ? "fill-amber-400 text-amber-400" : ""].join(" ")} />
                My Patients {physFavs.size > 0 ? `(${physFavs.size})` : ""}
              </button>
            </div>
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Click any row to view history · ☆ to save to My Patients
            </h2>
            {/* Badge legend */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground bg-card border border-border rounded-lg px-4 py-2.5">
              <span className="font-bold uppercase tracking-wider text-muted-foreground/60 shrink-0">Legend:</span>
              <span><span className="text-base">💩</span> No BM (48h+)</span>
              <span><span className="text-base">💥</span> Severe pain (24h)</span>
              <span><span className="text-base">🧠</span> 2+ behaviors (24h)</span>
              <span><span className="text-base">⚠️</span> Fall (24h)</span>
              <span><span className="text-base">📉</span> Abnormal vitals (24h)</span>
              <span><span className="text-base">💊</span> Active taper</span>
              <span><span className="text-base opacity-30 grayscale inline-block">💊</span> Taper unconfirmed &gt;48h</span>
            </div>
          </div>

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
            <div className="bg-card rounded-xl border border-border overflow-x-auto">
              <table className="w-full" data-testid="table-residents">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="px-3 py-4 w-10" title="Save to My Patients"><Star className="w-3.5 h-3.5 text-muted-foreground/40 mx-auto" /></th>
                    <SortTh label="Alert"             sortK="alertLevel" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortTh label="Last Name"         sortK="lastName"   currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortTh label="First Name"        sortK="firstName"  currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortTh label="MRP"               sortK="mrp"        currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortTh label="Room"              sortK="room"       currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortTh label="Last BM"           sortK="lastBM"     currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortTh label="Elapsed"           sortK="lastBM"     currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortTh label="Clinical Alerts (24h)" sortK="alerts" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {sortedResidents.map((resident, idx) => {
                    const isRed   = resident.alertLevel === "red";
                    const isAmber = resident.alertLevel === "amber";
                    const isSelected = selectedResident?.residentId === resident.residentId;
                    const { firstName, lastName } = parseName(resident.name);

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

                    const alertDot = isRed ? "bg-red-500" : isAmber ? "bg-amber-400" : "bg-emerald-500";

                    return (
                      <tr
                        key={resident.residentId}
                        data-testid={`row-resident-${resident.residentId}`}
                        onClick={() => setSelectedResident(isSelected ? null : resident)}
                        className={[
                          rowBg,
                          idx < sortedResidents.length - 1 ? "border-b border-border/50" : "",
                          "cursor-pointer hover:bg-primary/5 transition-colors group",
                        ].join(" ")}
                      >
                        <td className="px-3 py-4" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => togglePhysFav(resident.residentId, e)}
                            title={physFavs.has(resident.residentId) ? "Remove from My Patients" : "Add to My Patients"}
                            className="flex items-center justify-center w-7 h-7 rounded-lg hover:bg-amber-900/30 transition-colors"
                          >
                            <Star className={["w-4 h-4 transition-colors", physFavs.has(resident.residentId) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30 group-hover:text-amber-400/50"].join(" ")} />
                          </button>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-center">
                            <span className={["w-3 h-3 rounded-full", alertDot].join(" ")} data-testid={`alert-dot-${resident.residentId}`} />
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className={nameCls} data-testid={`name-resident-${resident.residentId}`}>
                            {lastName}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-muted-foreground">{firstName}</span>
                        </td>
                        <td className="px-4 py-4 text-xs text-muted-foreground whitespace-nowrap">{getMRP(resident.residentId)}</td>
                        <td className="px-4 py-4 text-muted-foreground font-mono">{resident.room}</td>
                        <td className="px-4 py-4 text-sm text-muted-foreground font-mono whitespace-nowrap">
                          {formatLastBM(resident.lastBMAt)}
                        </td>
                        <td className="px-4 py-4">
                          <span className={["text-sm font-semibold font-mono whitespace-nowrap", isRed ? "text-red-400" : isAmber ? "text-amber-400" : "text-muted-foreground"].join(" ")}>
                            {formatHours(resident.hoursSinceLastBM)}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-0.5 flex-wrap">
                            {(isRed || isAmber) && (
                              <span title={`No BM for ${resident.hoursSinceLastBM !== null ? Math.round(resident.hoursSinceLastBM) : "?"}h`} className="text-base leading-none">💩</span>
                            )}
                            {resident.hasSeverePain && (
                              <span title="Severe pain recorded in last 24h" className="text-base leading-none">💥</span>
                            )}
                            {resident.behaviorEventCount24h >= 2 && (
                              <span title={`${resident.behaviorEventCount24h} behavior events in last 24h`} className="text-base leading-none">🧠</span>
                            )}
                            {resident.hasFall24h && (
                              <span title="Fall event recorded in last 24h" className="text-base leading-none">⚠️</span>
                            )}
                            {resident.hasAbnormalVital24h && (
                              <span title="Abnormal vitals in last 24h" className="text-base leading-none">📉</span>
                            )}
                            {resident.hasTaperActive && (
                              <span title="Active deprescribing taper confirmed by frontline staff" className="text-base leading-none">💊</span>
                            )}
                            {!resident.hasTaperActive && resident.hasTaperUnconfirmed && (
                              <span title="Taper ordered but not yet confirmed by frontline staff (>48h)" className="text-base leading-none opacity-30 grayscale">💊</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
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

      </main>

      {/* Drill-down panel */}
      <DrillPanel
        resident={selectedResident}
        onClose={handleClose}
        onOpenOverlay={selectedResident ? () => setOverlayResident(selectedResident) : undefined}
      />

      {/* Full patient record overlay */}
      <PatientOverlay
        resident={overlayResident ? {
          residentId: overlayResident.residentId,
          name: overlayResident.name,
          room: overlayResident.room ?? null,
          dob: overlayResident.dob ?? null,
          codeStatus: overlayResident.codeStatus ?? null,
          allergies: overlayResident.allergies ?? [],
          infectionFlags: overlayResident.infectionFlags ?? [],
        } : null}
        onClose={() => setOverlayResident(null)}
      />
    </div>
  );
}
