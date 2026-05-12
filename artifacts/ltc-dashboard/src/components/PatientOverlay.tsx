import { useState, useMemo, useEffect, useCallback } from "react";
import {
  X, ChevronLeft, Syringe, Pill, ClipboardList, Activity,
  AlertTriangle, AlertCircle, Shield, Phone, UserCheck,
  FileText, Copy, Check, Printer, Mic, Upload, Loader2, Sparkles,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  getMockVitals, getMockLabs, getMockMeds, getMockEmar,
  getMockNotes, getMockImmunizations, getMockFalls,
  getMockPRNLaxCount, getMockPRNAntipsychoticCount,
  getMockProfile,
} from "@/data/mockData";
import type { VitalRecord, LabRecord, Medication, ProgressNote } from "@/data/mockData";
import { useCreateBowelMovement, useListBowelMovements } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────
export type OverlayResident = {
  residentId: number;
  name: string;
  room: string | null;
  dob: string | null;
  codeStatus?: string | null;
  allergies?: string[];
  infectionFlags?: string[];
  sdmName?: string | null;
  sdmRelation?: string | null;
  sdmPhone?: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function calcAge(dob: string | null): string {
  if (!dob) return "—";
  const d = new Date(dob);
  const today = new Date();
  const age = today.getFullYear() - d.getFullYear() -
    (today < new Date(today.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0);
  return `${age}y`;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

function fmtShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function lsGet(key: string, def: string) {
  try { return localStorage.getItem(key) ?? def; } catch { return def; }
}
function lsSet(key: string, val: string) {
  try { localStorage.setItem(key, val); } catch {}
}

// ── Vitals Trend Modal ─────────────────────────────────────────────────────────
type VitalKey = "sbp" | "hr" | "temp" | "o2" | "weight";
const VITAL_LABELS: Record<VitalKey, { label: string; unit: string; color: string }> = {
  sbp: { label: "Systolic BP", unit: "mmHg", color: "#60a5fa" },
  hr: { label: "Heart Rate", unit: "bpm", color: "#34d399" },
  temp: { label: "Temperature", unit: "°C", color: "#f59e0b" },
  o2: { label: "SpO₂", unit: "%", color: "#a78bfa" },
  weight: { label: "Weight", unit: "kg", color: "#f87171" },
};

function VitalsTrendModal({ vitalKey, records, onClose }: { vitalKey: VitalKey; records: VitalRecord[]; onClose: () => void }) {
  const [range, setRange] = useState<12 | 24 | 36>(12);
  const meta = VITAL_LABELS[vitalKey];
  const data = records.slice(-range).map(r => ({ date: fmtShort(r.date), value: r[vitalKey] }));
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-foreground">{meta.label}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Trend over time — {meta.unit}</p>
          </div>
          <div className="flex items-center gap-2">
            {([12, 24, 36] as const).map(r => (
              <button key={r} onClick={() => setRange(r)}
                className={["px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors",
                  range === r ? "bg-primary/20 border-primary text-primary" : "border-border text-muted-foreground hover:bg-muted"].join(" ")}>
                {r === 12 ? "1yr" : r === 24 ? "2yr" : "3yr"}
              </button>
            ))}
            <button onClick={onClose} className="ml-2 p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#888" }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#888" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ background: "#1c1c27", border: "1px solid #333", borderRadius: 8 }}
              labelStyle={{ color: "#ccc" }} itemStyle={{ color: meta.color }} />
            <Line type="monotone" dataKey="value" stroke={meta.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Lab Trend Modal ────────────────────────────────────────────────────────────
type LabKey = keyof Omit<LabRecord, "date">;
const LAB_META: Partial<Record<LabKey, { label: string; unit: string; normal: string; color: string }>> = {
  wbc: { label: "WBC", unit: "×10⁹/L", normal: "4.0–11.0", color: "#60a5fa" },
  hgb: { label: "Hemoglobin", unit: "g/L", normal: "120–180", color: "#f87171" },
  plt: { label: "Platelets", unit: "×10⁹/L", normal: "150–400", color: "#a78bfa" },
  na: { label: "Sodium", unit: "mmol/L", normal: "136–145", color: "#34d399" },
  k: { label: "Potassium", unit: "mmol/L", normal: "3.5–5.0", color: "#f59e0b" },
  cr: { label: "Creatinine", unit: "µmol/L", normal: "53–115", color: "#fb923c" },
  egfr: { label: "eGFR", unit: "mL/min", normal: ">60", color: "#38bdf8" },
  albumin: { label: "Albumin", unit: "g/L", normal: "35–50", color: "#86efac" },
  tsh: { label: "TSH", unit: "mU/L", normal: "0.4–4.0", color: "#c4b5fd" },
  hba1c: { label: "HbA1c", unit: "%", normal: "<7.0", color: "#fda4af" },
  glucose: { label: "Glucose", unit: "mmol/L", normal: "4.0–7.0", color: "#fdba74" },
  inr: { label: "INR", unit: "", normal: "2.0–3.0 (Rx)", color: "#67e8f9" },
  ldl: { label: "LDL", unit: "mmol/L", normal: "<2.0", color: "#d8b4fe" },
  alt: { label: "ALT", unit: "U/L", normal: "7–40", color: "#bbf7d0" },
};

function LabTrendModal({ labKey, records, onClose }: { labKey: LabKey; records: LabRecord[]; onClose: () => void }) {
  const meta = LAB_META[labKey];
  if (!meta) return null;
  const data = records.filter(r => r[labKey] != null).map(r => ({ date: fmtShort(r.date), value: r[labKey] as number }));
  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-foreground">{meta.label}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Normal: {meta.normal} {meta.unit}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-4 h-4" /></button>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#888" }} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#888" }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ background: "#1c1c27", border: "1px solid #333", borderRadius: 8 }}
              labelStyle={{ color: "#ccc" }} itemStyle={{ color: meta.color }} />
            <Line type="monotone" dataKey="value" stroke={meta.color} strokeWidth={2} dot={{ r: 3, fill: meta.color }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Hospital Transfer Pack Modal ───────────────────────────────────────────────
function HospitalTransferModal({ resident, onClose }: { resident: OverlayResident; onClose: () => void }) {
  const profile = useMemo(() => getMockProfile(resident.residentId), [resident.residentId]);
  const meds = useMemo(() => getMockMeds(resident.residentId), [resident.residentId]);
  const labs = useMemo(() => getMockLabs(resident.residentId), [resident.residentId]);
  const vitals = useMemo(() => getMockVitals(resident.residentId), [resident.residentId]);
  const lastV = vitals.at(-1)!;
  const lastL = labs.at(-1)!;
  const [copied, setCopied] = useState(false);

  const text = [
    `HOSPITAL TRANSFER SUMMARY`,
    `Generated: ${new Date().toLocaleString("en-CA")}`,
    `─────────────────────────────────────────────────────`,
    `PATIENT: ${resident.name}   Room: ${resident.room ?? "—"}   DOB: ${resident.dob ? String(resident.dob).slice(0, 10) : "—"}`,
    `Code Status: ${resident.codeStatus ?? "Not documented"}`,
    `Allergies: ${resident.allergies?.join(", ") || "NKDA"}`,
    `Isolation: ${resident.infectionFlags?.join(", ") || "None"}`,
    ``,
    `PAST MEDICAL HISTORY:`,
    profile.pmhx,
    ``,
    `SOCIAL HISTORY:`,
    profile.sochx,
    ``,
    `CURRENT MEDICATIONS (${meds.length}):`,
    ...meds.map(m => `  • ${m.name} ${m.dose} ${m.route} ${m.times.join("/")}${m.prn ? " PRN" : ""}`),
    ``,
    `MOST RECENT VITALS (${lastV?.date ?? "—"}):`,
    `  BP: ${lastV?.sbp}/${lastV?.dbp} mmHg   HR: ${lastV?.hr} bpm   RR: ${lastV?.rr}/min`,
    `  Temp: ${lastV?.temp}°C   SpO2: ${lastV?.o2}%   Weight: ${lastV?.weight} kg`,
    ``,
    `MOST RECENT LABS (${lastL?.date ?? "—"}):`,
    `  WBC: ${lastL?.wbc}  Hgb: ${lastL?.hgb} g/L  Na: ${lastL?.na}  K: ${lastL?.k}`,
    `  Cr: ${lastL?.cr} µmol/L  eGFR: ${lastL?.egfr}  Albumin: ${lastL?.albumin} g/L`,
    ...(lastL?.hba1c ? [`  HbA1c: ${lastL.hba1c}%`] : []),
    ...(lastL?.inr ? [`  INR: ${lastL.inr}`] : []),
    ``,
    `ASSESSMENT & PLAN:`,
    profile.ap,
    ``,
    `SDM: ${resident.sdmName ?? "Not documented"}   ${resident.sdmRelation ?? ""}   ${resident.sdmPhone ?? ""}`,
    `─────────────────────────────────────────────────────`,
  ].join("\n");

  const copy = () => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[88vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h3 className="text-lg font-bold">Hospital Transfer Pack</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{resident.name} — auto-generated summary</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={copy} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-muted text-sm font-medium text-muted-foreground transition-colors">
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied!" : "Copy All"}
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <pre className="flex-1 overflow-y-auto px-6 py-4 text-xs font-mono text-foreground/80 leading-relaxed whitespace-pre-wrap">{text}</pre>
      </div>
    </div>
  );
}

// ── Labs Drawer ────────────────────────────────────────────────────────────────
const LAB_DISPLAY_KEYS: LabKey[] = ["wbc", "hgb", "plt", "na", "k", "cr", "egfr", "albumin", "tsh", "hba1c", "glucose", "inr", "ldl", "alt"];

function LabsDrawer({ labs, onClose }: { labs: LabRecord[]; onClose: () => void }) {
  const [trendKey, setTrendKey] = useState<LabKey | null>(null);
  const [selectedColIdx, setSelectedColIdx] = useState<number | null>(null);
  const { toast } = useToast();
  const recent = labs.slice(-4).reverse();

  const presentKeys = LAB_DISPLAY_KEYS.filter(k => recent.some(r => r[k] != null));

  const copyCol = () => {
    if (selectedColIdx === null) return;
    const col = recent[selectedColIdx];
    const line = presentKeys.map(k => {
      const meta = LAB_META[k];
      const val = col[k];
      return val != null ? `${meta?.label ?? k}: ${val}` : null;
    }).filter(Boolean).join(", ");
    navigator.clipboard.writeText(line).then(() =>
      toast({ title: "Copied to Notes", description: "Lab values formatted and copied to clipboard." })
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-[150] bg-black/50" onClick={onClose} />
      <div className="fixed top-0 left-0 h-full w-[660px] max-w-full bg-card border-r border-border z-[160] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h3 className="font-bold text-foreground">Lab Results</h3>
          </div>
          <button
            onClick={copyCol}
            disabled={selectedColIdx === null}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/15 text-primary text-xs font-bold hover:bg-primary/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Copy className="w-3.5 h-3.5" />
            Copy Col to Notes
          </button>
        </div>
        {selectedColIdx !== null && (
          <p className="px-5 py-2 text-xs text-sky-400 bg-sky-900/20 border-b border-sky-900/30">
            Column {recent[selectedColIdx]?.date} selected — click "Copy Col to Notes" to format &amp; copy
          </p>
        )}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 sticky top-0">
                <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground w-[140px]">Test</th>
                <th className="text-left px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground w-[100px]">Normal</th>
                {recent.map((r, i) => (
                  <th key={i}
                    onClick={() => setSelectedColIdx(i === selectedColIdx ? null : i)}
                    className={["px-3 py-2.5 text-xs font-bold text-center cursor-pointer transition-colors",
                      selectedColIdx === i ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-muted"].join(" ")}>
                    {fmtShort(r.date)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {presentKeys.map(k => {
                const meta = LAB_META[k]!;
                return (
                  <tr key={k} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => setTrendKey(k)}
                        className="text-xs font-semibold text-primary hover:text-primary/80 text-left"
                      >
                        {meta.label}
                        {meta.unit && <span className="text-muted-foreground font-normal ml-1">({meta.unit})</span>}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground font-mono">{meta.normal}</td>
                    {recent.map((r, i) => {
                      const val = r[k];
                      return (
                        <td key={i} className={["px-3 py-2.5 text-xs text-center font-mono",
                          selectedColIdx === i ? "bg-primary/10" : ""].join(" ")}>
                          {val != null ? <span className="text-foreground">{val}</span> : <span className="text-muted-foreground/40">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-border shrink-0 text-xs text-muted-foreground">
          Click a test name to view trend graph · Click a date column to select for copy
        </div>
      </div>
      {trendKey && <LabTrendModal labKey={trendKey} records={labs} onClose={() => setTrendKey(null)} />}
    </>
  );
}

// ── Progress Notes Section ─────────────────────────────────────────────────────
const NOTE_TYPE_COLOUR: Record<string, string> = {
  Nurse: "border-l-emerald-500",
  Physician: "border-l-blue-500",
  PT: "border-l-orange-400",
  OT: "border-l-amber-400",
  SW: "border-l-violet-400",
  Dietitian: "border-l-teal-400",
};
const NOTE_ROLE_COLOUR: Record<string, string> = {
  Nurse: "text-emerald-400",
  Physician: "text-blue-400",
  PT: "text-orange-400",
  OT: "text-amber-400",
  SW: "text-violet-400",
  Dietitian: "text-teal-400",
};

function ProgressNotesSection({ notes }: { notes: ProgressNote[] }) {
  const [filter, setFilter] = useState("All");
  const types = ["All", "Nurse", "Physician", "PT", "OT", "SW", "Dietitian"];
  const filtered = filter === "All" ? notes : notes.filter(n => n.type === filter);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Progress Notes</h3>
        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {types.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>
      <div className="space-y-2.5">
        {filtered.map(n => (
          <div key={n.id} className={["rounded-xl border border-border/40 border-l-[3px] p-3.5 bg-background/50", NOTE_TYPE_COLOUR[n.type] ?? "border-l-muted"].join(" ")}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <p className="text-sm font-semibold text-foreground leading-tight">{n.author}</p>
                <p className={["text-xs font-medium mt-0.5", NOTE_ROLE_COLOUR[n.type] ?? "text-muted-foreground"].join(" ")}>{n.type}</p>
              </div>
              <p className="text-xs font-mono text-muted-foreground shrink-0">{fmt(n.date)}</p>
            </div>
            <p className="text-xs text-foreground/80 leading-relaxed">{n.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── EMAR Table ─────────────────────────────────────────────────────────────────
const SLOTS = ["0800", "1200", "1800", "2200"];

function EMARTable({ meds, emar }: { meds: Medication[]; emar: Record<string, Record<string, "given" | "missed" | "na">> }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">EMAR — Today</h3>
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-3 py-2 font-bold uppercase tracking-wider text-muted-foreground">Medication</th>
              {SLOTS.map(s => <th key={s} className="px-2 py-2 font-bold uppercase tracking-wider text-muted-foreground text-center w-16">{s}</th>)}
            </tr>
          </thead>
          <tbody>
            {meds.map((med, i) => (
              <tr key={med.id} className={["border-b border-border/40", i % 2 === 0 ? "" : "bg-muted/10"].join(" ")}>
                <td className="px-3 py-2.5">
                  <p className="font-semibold text-foreground">{med.name}</p>
                  <p className="text-muted-foreground text-[10px]">{med.dose} {med.route}{med.prn ? " · PRN" : ""}</p>
                </td>
                {SLOTS.map(slot => {
                  const status = emar[med.id]?.[slot] ?? "na";
                  return (
                    <td key={slot} className="px-2 py-2.5 text-center">
                      {status === "given" && <span className="inline-block w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold leading-6">✓</span>}
                      {status === "missed" && <span className="inline-block w-6 h-6 rounded-full bg-red-500/20 text-red-400 text-[10px] font-bold leading-6">✗</span>}
                      {status === "na" && <span className="text-muted-foreground/30">—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Immunizations ──────────────────────────────────────────────────────────────
function ImmunizationsSection({ residentId }: { residentId: number }) {
  const imm = useMemo(() => getMockImmunizations(residentId), [residentId]);
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Immunizations</h3>
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-3 py-2 font-bold uppercase tracking-wider text-muted-foreground">Vaccine</th>
              <th className="text-left px-3 py-2 font-bold uppercase tracking-wider text-muted-foreground">Dose</th>
              <th className="text-left px-3 py-2 font-bold uppercase tracking-wider text-muted-foreground">Date</th>
              <th className="text-left px-3 py-2 font-bold uppercase tracking-wider text-muted-foreground">Site</th>
            </tr>
          </thead>
          <tbody>
            {imm.map((v, i) => (
              <tr key={i} className={["border-b border-border/40", i % 2 === 0 ? "" : "bg-muted/10"].join(" ")}>
                <td className="px-3 py-2.5 font-semibold text-foreground">{v.vaccine}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{v.dose}</td>
                <td className="px-3 py-2.5 font-mono text-muted-foreground">{v.date}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{v.site}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Quick Bowel Tracker ────────────────────────────────────────────────────────
const BRISTOL_OPTS = [1, 2, 3, 4, 5, 6, 7] as const;
const BRISTOL_LABELS: Record<number, { label: string; bg: string }> = {
  1: { label: "Hard lumps", bg: "bg-[#2d1b11]" }, 2: { label: "Lumpy", bg: "bg-[#3e2723]" },
  3: { label: "Cracked", bg: "bg-[#5d4037]" }, 4: { label: "Smooth", bg: "bg-[#795548]" },
  5: { label: "Soft blobs", bg: "bg-[#bcaaa4]" }, 6: { label: "Fluffy", bg: "bg-[#d7ccc8]" },
  7: { label: "Liquid", bg: "bg-[#efebe9]" },
};
const AMOUNTS = ["Small", "Medium", "Large", "XL"] as const;
const ADD_INFO = ["None", "Blood Present", "Mucus Present", "Pain/Straining", "Incontinent"] as const;

function BowelTrackerSection({ residentId }: { residentId: number }) {
  const [bristol, setBristol] = useState<number | null>(null);
  const [amount, setAmount] = useState<string | null>(null);
  const [addInfo, setAddInfo] = useState("None");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { mutate, isPending } = useCreateBowelMovement();
  const { data: bmEvents = [] } = useListBowelMovements(
    { residentId },
    { query: { queryKey: [`/api/bowel-movements`, { residentId }] } },
  );

  const lastBM = bmEvents.length > 0
    ? new Date(bmEvents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0].createdAt)
    : null;

  const handleLog = () => {
    if (!bristol || !amount) return;
    mutate({
      data: {
        residentId,
        bristolType: bristol as 1 | 2 | 3 | 4 | 5 | 6 | 7,
        amount: amount as "Small" | "Medium" | "Large" | "XL",
        incontinence: addInfo === "Incontinent",
        bloodPresent: addInfo === "Blood Present",
        mucusPresent: addInfo === "Mucus Present",
        painStraining: addInfo === "Pain/Straining",
        clinicalNote: `Bristol Type ${bristol}, ${amount}.${addInfo !== "None" ? ` Note: ${addInfo}.` : ""}`,
      },
    }, {
      onSuccess: () => {
        toast({ title: "BM Logged", description: `Bristol Type ${bristol}, ${amount}` });
        void queryClient.invalidateQueries({ queryKey: [`/api/bowel-movements`, { residentId }] });
        setBristol(null); setAmount(null); setAddInfo("None");
      },
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Bowel Tracker</h3>
        {lastBM && (
          <span className="text-[10px] font-mono text-muted-foreground/60">
            Last: {lastBM.toLocaleDateString("en-CA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {BRISTOL_OPTS.map(b => {
          const bl = BRISTOL_LABELS[b];
          return (
            <button key={b} onClick={() => setBristol(b === bristol ? null : b)}
              className={["flex flex-col items-center gap-0.5 w-12 py-2 rounded-xl border-2 transition-all",
                bristol === b ? "border-primary scale-105 shadow-lg" : "border-transparent hover:border-border",
                bl.bg, b <= 4 ? "text-white" : "text-black/80"].join(" ")}>
              <span className="font-bold text-sm">{b}</span>
              <span className="text-[8px] leading-tight text-center hidden">{bl.label}</span>
            </button>
          );
        })}
      </div>
      {bristol && <p className="text-xs text-muted-foreground">Type {bristol} — {BRISTOL_LABELS[bristol].label}</p>}
      <div className="flex gap-2 flex-wrap">
        {AMOUNTS.map(a => (
          <button key={a} onClick={() => setAmount(a === amount ? null : a)}
            className={["px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors",
              amount === a ? "bg-primary/20 border-primary text-primary" : "border-border text-muted-foreground hover:bg-muted"].join(" ")}>
            {a}
          </button>
        ))}
      </div>
      <select value={addInfo} onChange={e => setAddInfo(e.target.value)}
        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
        {ADD_INFO.map(o => <option key={o}>{o}</option>)}
      </select>
      <button onClick={handleLog} disabled={!bristol || !amount || isPending}
        className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-40">
        {isPending ? "Logging…" : "Log BM Entry"}
      </button>
    </div>
  );
}

// ── Intelligent Document Intake ───────────────────────────────────────────────

interface ExtractedItem  { text: string; accepted: boolean; }
interface DocIntakeResult { allergies: string[]; pmhx: string[]; followUps: string[]; }

const MOCK_DISCHARGE: { allergies: ExtractedItem[]; pmhx: ExtractedItem[]; followUps: ExtractedItem[] } = {
  allergies: [
    { text: "Sulfa Drugs — rash and urticaria",               accepted: true  },
    { text: "Codeine — GI intolerance and excessive sedation", accepted: true  },
  ],
  pmhx: [
    { text: "Atrial Fibrillation — newly diagnosed (May 2026)",            accepted: true  },
    { text: "Type 2 Diabetes Mellitus — revised to insulin-dependent",     accepted: true  },
    { text: "Mild Cognitive Impairment — progressive (MMSE 21/30)",        accepted: false },
  ],
  followUps: [
    { text: "Repeat echocardiogram in 3 months",                accepted: true  },
    { text: "Geriatric Psychiatry follow-up — June 15, 2026",  accepted: true  },
    { text: "Cardiology referral for rate control review",      accepted: true  },
    { text: "Repeat HbA1c in 6 weeks",                         accepted: false },
    { text: "Neurology referral for MCI workup",               accepted: false },
  ],
};

function DocIntakeModal({ residentName, onApprove, onClose }: {
  residentName: string;
  onApprove: (result: DocIntakeResult) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState(() => ({
    allergies: MOCK_DISCHARGE.allergies.map(i => ({ ...i })),
    pmhx:      MOCK_DISCHARGE.pmhx.map(i => ({ ...i })),
    followUps: MOCK_DISCHARGE.followUps.map(i => ({ ...i })),
  }));

  type Sec = "allergies" | "pmhx" | "followUps";
  const toggle = (sec: Sec, idx: number) =>
    setItems(p => ({ ...p, [sec]: p[sec].map((x, i) => i === idx ? { ...x, accepted: !x.accepted } : x) }));

  const handleApprove = () => onApprove({
    allergies: items.allergies.filter(x => x.accepted).map(x => x.text),
    pmhx:      items.pmhx.filter(x => x.accepted).map(x => x.text),
    followUps: items.followUps.filter(x => x.accepted).map(x => x.text),
  });

  const Row = ({ accepted, onToggle, text, activeCls }: {
    accepted: boolean; onToggle: () => void; text: string; activeCls: string;
  }) => (
    <button onClick={onToggle} className="w-full flex items-start gap-3 text-left group">
      <div className={["mt-0.5 w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-all", accepted ? activeCls : "border-border/60 group-hover:border-border"].join(" ")}>
        {accepted && <Check className="w-2.5 h-2.5 text-white" />}
      </div>
      <p className={["text-sm leading-relaxed select-none pt-0.5", accepted ? "text-foreground" : "text-muted-foreground/50 line-through"].join(" ")}>{text}</p>
    </button>
  );

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0 bg-amber-950/20">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Review Extracted Data</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{residentName} — parsed from Discharge Summary</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted text-muted-foreground"><X className="w-5 h-5" /></button>
        </div>

        {/* Subheader hint */}
        <div className="px-6 py-2.5 border-b border-border/50 bg-muted/10">
          <p className="text-xs text-muted-foreground/70">Click any item to toggle acceptance. Unchecked items will not be applied to the chart.</p>
        </div>

        {/* Sections */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* A — Allergies */}
          <div className="rounded-xl border border-red-500/30 bg-red-950/20 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-red-500/20 bg-red-950/30">
              <AlertCircle className="w-3.5 h-3.5 text-red-400" />
              <p className="text-xs font-bold uppercase tracking-widest text-red-300">A — Allergies &amp; Adverse Reactions</p>
            </div>
            <div className="px-4 py-3 space-y-2.5">
              {items.allergies.map((item, i) => (
                <Row key={i} accepted={item.accepted} onToggle={() => toggle("allergies", i)} text={item.text}
                  activeCls="bg-red-500 border-red-400" />
              ))}
            </div>
          </div>

          {/* B — PMHx */}
          <div className="rounded-xl border border-blue-500/30 bg-blue-950/20 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-blue-500/20 bg-blue-950/30">
              <ClipboardList className="w-3.5 h-3.5 text-blue-400" />
              <p className="text-xs font-bold uppercase tracking-widest text-blue-300">B — Past Medical History</p>
            </div>
            <div className="px-4 py-3 space-y-2.5">
              {items.pmhx.map((item, i) => (
                <Row key={i} accepted={item.accepted} onToggle={() => toggle("pmhx", i)} text={item.text}
                  activeCls="bg-blue-500 border-blue-400" />
              ))}
            </div>
          </div>

          {/* C — Follow-Ups */}
          <div className="rounded-xl border border-violet-500/30 bg-violet-950/20 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-violet-500/20 bg-violet-950/30">
              <FileText className="w-3.5 h-3.5 text-violet-400" />
              <p className="text-xs font-bold uppercase tracking-widest text-violet-300">C — Follow-Up Tasks</p>
            </div>
            <div className="px-4 py-3 space-y-2.5">
              {items.followUps.map((item, i) => (
                <Row key={i} accepted={item.accepted} onToggle={() => toggle("followUps", i)} text={item.text}
                  activeCls="bg-violet-500 border-violet-400" />
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border shrink-0 flex gap-3">
          <button onClick={handleApprove}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20">
            <Check className="w-4 h-4" />
            Approve &amp; Update Chart
          </button>
          <button onClick={onClose}
            className="px-6 py-3.5 rounded-xl border border-border text-muted-foreground hover:bg-muted transition-colors text-sm font-medium shrink-0">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Patient Overlay ───────────────────────────────────────────────────────────
export function PatientOverlay({ resident, onClose, inline = false }: { resident: OverlayResident | null; onClose: () => void; inline?: boolean }) {
  const isOpen = resident !== null;
  const [showLabsDrawer, setShowLabsDrawer] = useState(false);
  const [vitalModal, setVitalModal] = useState<VitalKey | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [docIntakeState, setDocIntakeState] = useState<"idle" | "processing" | "reviewing">("idle");
  const [injectedAllergies, setInjectedAllergies] = useState<string[]>([]);
  const [intakeFollowUps, setIntakeFollowUps] = useState<{ text: string; done: boolean }[]>([]);
  const { toast } = useToast();

  const vitals = useMemo(() => resident ? getMockVitals(resident.residentId) : [], [resident]);
  const labs = useMemo(() => resident ? getMockLabs(resident.residentId) : [], [resident]);
  const meds = useMemo(() => resident ? getMockMeds(resident.residentId) : [], [resident]);
  const emar = useMemo(() => getMockEmar(meds, resident?.residentId ?? 0), [meds, resident?.residentId]);
  const notes = useMemo(() => resident ? getMockNotes(resident.residentId, resident.name) : [], [resident]);
  const falls = useMemo(() => resident ? getMockFalls(resident.residentId) : [], [resident]);
  const prnLax = useMemo(() => resident ? getMockPRNLaxCount(resident.residentId) : 0, [resident]);
  const prnAP = useMemo(() => resident ? getMockPRNAntipsychoticCount(resident.residentId) : 0, [resident]);

  const profile = useMemo(() => resident ? getMockProfile(resident.residentId) : null, [resident]);
  const lsKey = (field: string) => `ltc_overlay_${resident?.residentId}_${field}`;

  const [pmhx, setPmhx] = useState("");
  const [sochx, setSochx] = useState("");
  const [ap, setAp] = useState("");

  useEffect(() => {
    if (!resident || !profile) return;
    setPmhx(lsGet(lsKey("pmhx"), profile.pmhx));
    setSochx(lsGet(lsKey("sochx"), profile.sochx));
    setAp(lsGet(lsKey("ap"), profile.ap));
    setDocIntakeState("idle");
    setInjectedAllergies([]);
    setIntakeFollowUps([]);
  }, [resident?.residentId]); // eslint-disable-line

  useEffect(() => {
    if (inline) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, inline]);

  const lastV = vitals.at(-1);

  const VITALS_STRIP: { key: VitalKey; label: string; value: string; unit: string }[] = lastV ? [
    { key: "sbp", label: "BP", value: `${lastV.sbp}/${lastV.dbp}`, unit: "mmHg" },
    { key: "hr", label: "HR", value: String(lastV.hr), unit: "bpm" },
    { key: "temp", label: "Temp", value: String(lastV.temp), unit: "°C" },
    { key: "o2", label: "SpO₂", value: String(lastV.o2), unit: "%" },
    { key: "weight", label: "Wt", value: String(lastV.weight), unit: "kg" },
  ] : [];

  const save = useCallback((field: string, val: string) => { lsSet(lsKey(field), val); }, [resident?.residentId]);

  if (!isOpen || !resident) return null;

  const photoUrl = `https://i.pravatar.cc/100?img=${((resident.residentId - 6) % 70) + 1}`;
  const hasAlerts = !!(resident.codeStatus || resident.allergies?.length || resident.infectionFlags?.length || injectedAllergies.length);
  const bmGaps = Math.max(0, (falls.length > 0 ? 1 : 0) + (prnLax > 3 ? 2 : 0));

  return (
    <>
      <div
        className={inline ? "bg-background text-foreground flex flex-col" : "fixed inset-0 z-[95] bg-background text-foreground flex flex-col"}
        style={inline ? undefined : { animation: "fadeIn 0.18s ease" }}
      >
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="shrink-0 bg-card border-b border-border px-6 py-3">
          {/* Row 1: Identity + close */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-border bg-muted">
                <img src={photoUrl} alt={resident.name} className="w-full h-full object-cover" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground leading-tight">{resident.name}</h2>
                <p className="text-xs text-muted-foreground">Room {resident.room ?? "—"} · Age {calcAge(resident.dob)}</p>
                {hasAlerts && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {resident.codeStatus && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-purple-900/40 text-purple-300 border border-purple-500/40 uppercase tracking-wide">
                        <Shield className="w-3 h-3" />{resident.codeStatus}
                      </span>
                    )}
                    {[...(resident.allergies ?? []), ...injectedAllergies].map(a => (
                      <span key={a} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-900/40 text-red-300 border border-red-500/40 uppercase">
                        <AlertCircle className="w-3 h-3" />ALLERGY: {a}
                      </span>
                    ))}
                    {resident.infectionFlags?.map(f => (
                      <span key={f} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-900/40 text-amber-300 border border-amber-500/40 uppercase">
                        <AlertTriangle className="w-3 h-3" />ISOLATION: {f}
                      </span>
                    ))}
                    {resident.sdmName && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground border border-border">
                        <UserCheck className="w-3 h-3" />{resident.sdmName}
                        {resident.sdmPhone && <a href={`tel:${resident.sdmPhone}`} className="ml-1 text-primary hover:underline"><Phone className="w-3 h-3 inline" /></a>}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => setShowTransfer(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors">
                <Printer className="w-3.5 h-3.5" />Hospital Transfer Pack
              </button>
              {!inline && (
                <button onClick={onClose}
                  className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          {/* Row 2: Badges + Vitals strip */}
          <div className="flex items-center gap-6 mt-3 flex-wrap">
            {/* Risk badges */}
            <div className="flex items-center gap-2">
              <BadgePill label="Falls (1yr)" value={falls.length} warn={falls.length >= 1} danger={falls.length >= 3} />
              <BadgePill label="PRN Lax (14d)" value={prnLax} warn={prnLax >= 3} danger={prnLax >= 6} />
              <BadgePill label="PRN Antipsych (14d)" value={prnAP} warn={prnAP >= 2} danger={prnAP >= 4} />
              <BadgePill label="48h BM Gaps" value={bmGaps} warn={bmGaps >= 1} danger={bmGaps >= 3} />
            </div>

            {/* Vitals strip */}
            {lastV && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mr-1">Vitals</span>
                {VITALS_STRIP.map(v => (
                  <button key={v.key} onClick={() => setVitalModal(v.key)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted/40 hover:bg-muted border border-border/50 transition-colors">
                    <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">{v.label}</span>
                    <span className="text-xs font-mono font-bold text-foreground">{v.value}</span>
                    <span className="text-[10px] text-muted-foreground/60">{v.unit}</span>
                  </button>
                ))}
                <span className="text-[10px] text-muted-foreground/50 ml-1 font-mono">{lastV.date}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Body: 50/50 split ──────────────────────────────────────────────── */}
        <div className={inline ? "flex flex-col" : "flex-1 flex overflow-hidden"}>
          {/* Left half */}
          <div className={inline ? "px-5 py-5 space-y-8 border-b border-border" : "flex-1 overflow-y-auto border-r border-border px-5 py-5 space-y-8"}>
            <ProgressNotesSection notes={notes} />
            <EMARTable meds={meds} emar={emar} />
            <ImmunizationsSection residentId={resident.residentId} />
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5" /> Bowel Tracker
              </h3>
              <BowelTrackerSection residentId={resident.residentId} />
            </div>
          </div>

          {/* Right half */}
          <div className={inline ? "px-5 py-5 space-y-6" : "flex-1 overflow-y-auto px-5 py-5 space-y-6"}>
            {/* AI Document Intake */}
            {docIntakeState === "idle" && (
              <button
                onClick={() => {
                  setDocIntakeState("processing");
                  setTimeout(() => setDocIntakeState("reviewing"), 2000);
                }}
                className="w-full flex items-center gap-3 py-3.5 px-4 rounded-xl border-2 border-dashed border-amber-500/40 bg-amber-950/10 hover:bg-amber-950/25 hover:border-amber-500/60 transition-all group text-left"
              >
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 group-hover:bg-amber-500/30 transition-colors">
                  <Upload className="w-4 h-4 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-amber-300 leading-tight">Upload Discharge Summary (AI Auto-Chart)</p>
                  <p className="text-xs text-amber-400/60 mt-0.5">PDF, DOCX, or plain text — AI extracts clinical entities</p>
                </div>
                <Sparkles className="w-4 h-4 text-amber-400/50 shrink-0" />
              </button>
            )}
            {docIntakeState === "processing" && (
              <div className="w-full flex items-center justify-center gap-3 py-3.5 px-4 rounded-xl border-2 border-amber-500/30 bg-amber-950/15">
                <Loader2 className="w-5 h-5 text-amber-400 animate-spin shrink-0" />
                <p className="text-sm font-semibold text-amber-300">AI extracting clinical entities…</p>
              </div>
            )}

            {/* Labs button */}
            <button onClick={() => setShowLabsDrawer(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-primary/40 text-primary hover:bg-primary/5 transition-colors font-bold text-sm">
              <ClipboardList className="w-4 h-4" />
              View Labs →
            </button>

            {/* PMHx */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Past Medical History</label>
              <textarea
                value={pmhx}
                onChange={e => { setPmhx(e.target.value); save("pmhx", e.target.value); }}
                rows={4}
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none leading-relaxed"
              />
            </div>

            {/* SocHx */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Social History</label>
              <textarea
                value={sochx}
                onChange={e => { setSochx(e.target.value); save("sochx", e.target.value); }}
                rows={4}
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none leading-relaxed"
              />
            </div>

            {/* A&P */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Assessment &amp; Plan</label>
              <textarea
                value={ap}
                onChange={e => { setAp(e.target.value); save("ap", e.target.value); }}
                rows={5}
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none leading-relaxed"
              />
            </div>

            {/* Med list (read-only) */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Pill className="w-3.5 h-3.5" /> Medication List ({meds.length})
              </h3>
              <div className="rounded-xl border border-border bg-background/50 divide-y divide-border/40">
                {meds.map(med => (
                  <div key={med.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{med.name}</p>
                      <p className="text-xs text-muted-foreground">{med.dose} {med.route} · {med.times.join(", ")}{med.prn ? " · PRN" : ""}</p>
                    </div>
                    {med.category === "laxative" && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-900/30 text-amber-400 font-bold border border-amber-500/30">Lax</span>}
                    {med.category === "antipsychotic" && <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-900/30 text-violet-400 font-bold border border-violet-500/30">AP</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* AI Smart Follow-Up Tracker — populated from document intake */}
            {intakeFollowUps.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                  <h3 className="text-xs font-bold uppercase tracking-widest text-violet-300">AI Smart Follow-Up Tracker</h3>
                  <span className="text-[10px] text-violet-400/50 ml-1">— from Discharge Summary</span>
                </div>
                <div className="rounded-xl border border-violet-500/30 bg-violet-950/20 p-3.5 space-y-2.5">
                  {intakeFollowUps.map((f, i) => (
                    <button
                      key={i}
                      onClick={() => setIntakeFollowUps(prev => prev.map((x, j) => j === i ? { ...x, done: !x.done } : x))}
                      className="w-full flex items-start gap-3 text-left group"
                    >
                      <div className={[
                        "mt-0.5 w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center transition-all",
                        f.done
                          ? "bg-violet-600 border-violet-400"
                          : "border-violet-500/40 group-hover:border-violet-400",
                      ].join(" ")}>
                        {f.done && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                      <span className={[
                        "text-xs leading-relaxed transition-colors pt-0.5",
                        f.done ? "line-through text-violet-400/40" : "text-violet-100/80",
                      ].join(" ")}>
                        {f.text}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {docIntakeState === "reviewing" && (
        <DocIntakeModal
          residentName={resident.name}
          onClose={() => setDocIntakeState("idle")}
          onApprove={(result) => {
            if (result.pmhx.length > 0) {
              const stamp = new Date().toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
              const appended =
                (pmhx.trim() ? pmhx + (pmhx.endsWith("\n") ? "" : "\n") : "") +
                `\n— Discharge Summary (${stamp}):\n${result.pmhx.map(p => `• ${p}`).join("\n")}`;
              setPmhx(appended);
              save("pmhx", appended);
            }
            if (result.allergies.length > 0) {
              setInjectedAllergies(prev => [...new Set([...prev, ...result.allergies])]);
            }
            if (result.followUps.length > 0) {
              setIntakeFollowUps(prev => [...prev, ...result.followUps.map(t => ({ text: t, done: false }))]);
            }
            setDocIntakeState("idle");
            toast({
              title: "Chart Updated from Discharge Summary",
              description: `${result.pmhx.length} PMHx item${result.pmhx.length !== 1 ? "s" : ""}, ${result.allergies.length} allerg${result.allergies.length !== 1 ? "ies" : "y"}, ${result.followUps.length} follow-up${result.followUps.length !== 1 ? "s" : ""} applied.`,
            });
          }}
        />
      )}
      {showLabsDrawer && <LabsDrawer labs={labs} onClose={() => setShowLabsDrawer(false)} />}
      {vitalModal && <VitalsTrendModal vitalKey={vitalModal} records={vitals} onClose={() => setVitalModal(null)} />}
      {showTransfer && <HospitalTransferModal resident={resident} onClose={() => setShowTransfer(false)} />}

      <style>{`@keyframes fadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }`}</style>
    </>
  );
}

// ── Badge Pill helper ──────────────────────────────────────────────────────────
function BadgePill({ label, value, warn, danger }: { label: string; value: number; warn: boolean; danger: boolean }) {
  const cls = danger
    ? "bg-red-900/40 text-red-300 border-red-500/40"
    : warn
    ? "bg-amber-900/30 text-amber-300 border-amber-500/40"
    : "bg-muted/60 text-muted-foreground border-border";
  return (
    <div className={["flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold", cls].join(" ")}>
      <span className="text-sm font-extrabold">{value}</span>
      <span className="font-medium opacity-80 whitespace-nowrap">{label}</span>
    </div>
  );
}
