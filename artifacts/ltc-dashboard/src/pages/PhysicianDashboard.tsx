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
} from "lucide-react";
import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

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

function DrillPanel({ resident, onClose }: DrillPanelProps) {
  const isOpen = resident !== null;
  const [isEditing, setIsEditing] = useState(false);

  const [formCodeStatus, setFormCodeStatus] = useState("");
  const [formAllergies, setFormAllergies] = useState<string[]>([]);
  const [formInfectionFlags, setFormInfectionFlags] = useState<string[]>([]);
  const [formSdmName, setFormSdmName] = useState("");
  const [formSdmRelation, setFormSdmRelation] = useState("");
  const [formSdmPhone, setFormSdmPhone] = useState("");
  const [allergyInput, setAllergyInput] = useState("");
  const [flagInput, setFlagInput] = useState("");

  const queryClient = useQueryClient();
  const { mutate: saveDemographics, isPending: isSaving } = useUpdateResidentDemographics();

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

  const { data: events = [], isLoading } = useListBowelMovements(
    { residentId: resident?.residentId },
    { query: { enabled: !!resident, queryKey: [`/api/bowel-movements`, { residentId: resident?.residentId }] } },
  );

  const sorted = [...events].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isEditing) setIsEditing(false);
        else onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, isEditing]);

  useEffect(() => {
    if (!isOpen) setIsEditing(false);
  }, [isOpen]);

  const isRed   = resident?.alertLevel === "red";
  const isAmber = resident?.alertLevel === "amber";
  const nameCls = isRed ? "text-red-400" : isAmber ? "text-amber-400" : "text-foreground";
  const alertDot = isRed ? "bg-red-500" : isAmber ? "bg-amber-400" : "bg-emerald-500";

  const initials = resident?.name
    ? resident.name.split(" ").map((p) => p[0]).slice(0, 2).join("")
    : "?";

  const hasAlerts = !!(resident?.codeStatus || resident?.allergies?.length || resident?.infectionFlags?.length);

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
            {/* Photo placeholder */}
            <div className={[
              "w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold shrink-0 border-2",
              isRed ? "bg-red-900/40 text-red-300 border-red-700/50"
                : isAmber ? "bg-amber-900/40 text-amber-300 border-amber-700/50"
                : "bg-muted text-muted-foreground border-border",
            ].join(" ")}>
              {initials}
            </div>
            <div>
              <h2 className={["text-xl font-bold", nameCls].join(" ")}>
                {resident?.name ?? "—"}
              </h2>
              <p className="text-xs text-muted-foreground">Room {resident?.room}</p>
              {resident && (
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
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
          <div className="flex items-center gap-1.5 shrink-0">
            {!isEditing && (
              <button
                onClick={openEdit}
                title="Edit demographics"
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

        {/* High-alert tags */}
        {resident && hasAlerts && !isEditing && (
          <div className="px-6 py-3 border-b border-border shrink-0 flex flex-wrap gap-2">
            {resident.codeStatus && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-purple-900/40 text-purple-300 border border-purple-500/40 uppercase tracking-wide">
                <Shield className="w-3 h-3 shrink-0" />
                {resident.codeStatus}
              </span>
            )}
            {resident.allergies?.map((a) => (
              <span key={a} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-red-900/40 text-red-300 border border-red-500/40 uppercase tracking-wide">
                <AlertCircle className="w-3 h-3 shrink-0" />
                ALLERGY: {a}
              </span>
            ))}
            {resident.infectionFlags?.map((f) => (
              <span key={f} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-900/40 text-amber-300 border border-amber-500/40 uppercase tracking-wide">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                ISOLATION: {f}
              </span>
            ))}
          </div>
        )}

        {/* SDM section */}
        {resident?.sdmName && !isEditing && (
          <div className="px-6 py-3 border-b border-border shrink-0 bg-muted/20">
            <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/60 mb-2 flex items-center gap-1.5">
              <UserCheck className="w-3 h-3" />
              Substitute Decision Maker
            </p>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">{resident.sdmName}</p>
                {resident.sdmRelation && <p className="text-xs text-muted-foreground">{resident.sdmRelation}</p>}
              </div>
              {resident.sdmPhone && (
                <a
                  href={`tel:${resident.sdmPhone}`}
                  className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-mono font-medium shrink-0"
                >
                  <Phone className="w-3.5 h-3.5" />
                  {resident.sdmPhone}
                </a>
              )}
            </div>
          </div>
        )}

        {/* Alert strip */}
        {resident && !isEditing && (
          <div
            className={[
              "px-6 py-2.5 text-sm font-semibold flex items-center gap-2 shrink-0",
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

        {/* Edit form */}
        {isEditing ? (
          <div className="flex-1 overflow-y-auto">
            <div className="px-6 py-5 space-y-6">
              <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground/60">Editing Demographics — {resident?.name}</p>

              {/* Code Status */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-purple-400" /> Code Status
                </label>
                <input
                  type="text"
                  value={formCodeStatus}
                  onChange={(e) => setFormCodeStatus(e.target.value)}
                  placeholder="e.g. DNR M1-M4 C1, C2 · Full Code · CPR"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Allergies */}
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

              {/* Infection Control */}
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

              {/* SDM */}
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-primary" /> Substitute Decision Maker
                </label>
                <input
                  type="text"
                  value={formSdmName}
                  onChange={(e) => setFormSdmName(e.target.value)}
                  placeholder="Full name"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <input
                  type="text"
                  value={formSdmRelation}
                  onChange={(e) => setFormSdmRelation(e.target.value)}
                  placeholder="Relationship (e.g. Daughter, Son, Spouse)"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <input
                  type="tel"
                  value={formSdmPhone}
                  onChange={(e) => setFormSdmPhone(e.target.value)}
                  placeholder="Phone number"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>

            {/* Save / Cancel bar */}
            <div className="sticky bottom-0 border-t border-border bg-card px-6 py-4 flex gap-3">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {isSaving ? "Saving…" : "Save Changes"}
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="px-4 py-2.5 rounded-xl border border-border text-muted-foreground hover:bg-muted transition-colors text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Monthly badges */}
            {resident && (
              <div className="flex gap-2 px-6 py-3 border-b border-border shrink-0 flex-wrap">
                <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-1.5">
                  <CalendarX className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-amber-400 font-bold text-sm">{resident.monthlyGapCount}</span>
                  <span className="text-muted-foreground text-xs">48h gaps</span>
                </div>
                <div className="flex items-center gap-2 bg-red-600/10 border border-red-600/25 rounded-lg px-3 py-1.5">
                  <Droplet className="w-3.5 h-3.5 text-red-400" />
                  <span className="text-red-400 font-bold text-sm">{resident.monthlyBloodCount}</span>
                  <span className="text-muted-foreground text-xs">blood events</span>
                </div>
                <div className="flex items-center gap-2 bg-primary/10 border border-primary/25 rounded-lg px-3 py-1.5">
                  <Activity className="w-3.5 h-3.5 text-primary" />
                  <span className="text-primary font-bold text-sm">{events.length}</span>
                  <span className="text-muted-foreground text-xs">BMs recorded</span>
                </div>
              </div>
            )}

            {/* BM History */}
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
                  <p className="text-muted-foreground/60 text-sm">Use the Frontline Staff view to log the first entry.</p>
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
                    className={["rounded-xl border p-4 space-y-3", isFirst ? "border-primary/40 bg-primary/5" : "border-border bg-background/60"].join(" ")}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-muted-foreground">
                        {formatFull(bm.createdAt)}
                        {isFirst && (
                          <span className="ml-2 text-primary font-bold uppercase tracking-wider text-[10px] bg-primary/15 px-2 py-0.5 rounded-full">Most recent</span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={["w-10 h-10 rounded-full flex items-center justify-center font-bold text-base shrink-0", bristol.dot, bristol.text].join(" ")}>
                        {bm.bristolType}
                      </div>
                      <div>
                        <p className="font-semibold text-foreground text-sm">Type {bm.bristolType} &nbsp;·&nbsp; {bristol.label}</p>
                        <p className="text-muted-foreground text-sm">Amount: <span className="font-medium text-foreground">{bm.amount}</span></p>
                      </div>
                    </div>
                    {hasFlags && (
                      <div className="flex flex-wrap gap-2">
                        {bm.incontinence && <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">Incontinence</span>}
                        {bm.bloodPresent && <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-600/20 text-red-400 border border-red-600/30">Blood Present</span>}
                        {bm.mucusPresent && <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">Mucus Present</span>}
                        {bm.painStraining && <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">Pain / Straining</span>}
                      </div>
                    )}
                    {bm.clinicalNote && (
                      <p className="text-xs font-mono text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 leading-relaxed border border-border/50">{bm.clinicalNote}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </aside>
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

function CommHubView() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ── Composer state ──
  const [selectedResidentId, setSelectedResidentId] = useState<number | null>(null);
  const [method, setMethod] = useState<CommMethod>("Fax");
  const [selectedContactId, setSelectedContactId] = useState<number | "custom" | null>(null);
  const [customValue, setCustomValue] = useState("");
  const [note, setNote] = useState("");
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
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Clinical Note</p>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={7}
                  placeholder={`Enter the message to send via ${method.toLowerCase()}…`}
                  className="w-full bg-card border-2 border-border rounded-xl p-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 text-sm resize-none leading-relaxed"
                />
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

function OrderHub() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [residentQuery, setResidentQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedResidentId, setSelectedResidentId] = useState<number | null>(null);
  const [selectedResidentName, setSelectedResidentName] = useState("");
  const [selectedResidentRoom, setSelectedResidentRoom] = useState("");
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
      <div className="flex items-center gap-3">
        <div className="bg-violet-500/15 p-2.5 rounded-xl">
          <Stethoscope className="w-5 h-5 text-violet-400" />
        </div>
        <div>
          <h2 className="font-bold text-lg text-foreground">CPOE — Computerized Provider Order Entry</h2>
          <p className="text-xs text-muted-foreground">Select a resident, build an order from templates or free text, then sign &amp; transmit.</p>
        </div>
      </div>

      {/* Resident Picker */}
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

// ── Sort helpers ──────────────────────────────────────────────────────────────

type SortKey = "alertLevel" | "lastName" | "firstName" | "room" | "lastBM" | "gaps" | "blood" | "alerts";

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

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function PhysicianDashboard() {
  const [time, setTime] = useState(new Date());
  const [selectedResident, setSelectedResident] = useState<ResidentAlertSummary | null>(null);
  const [view, setView] = useState<"population" | "binder" | "directory" | "cpoe">("population");
  const [sortKey, setSortKey] = useState<SortKey>("alertLevel");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

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
    return [...data.residents].sort((a, b) => {
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
        default: return 0;
      }
    });
  }, [data, sortKey, sortDir]);

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
        </div>
      </div>

      <main className="max-w-7xl mx-auto p-8 space-y-8">
        {view === "binder" && <VirtualBinder />}
        {view === "directory" && <CommHubView />}
        {view === "cpoe" && <OrderHub />}


        {/* Resident Summary Table */}
        {view === "population" && <section className="space-y-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Resident Status — Click any row to view full history
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
                    <SortTh label="Alert"             sortK="alertLevel" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortTh label="Last Name"         sortK="lastName"   currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
                    <SortTh label="First Name"        sortK="firstName"  currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
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
