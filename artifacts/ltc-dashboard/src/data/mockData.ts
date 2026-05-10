// ── Seeded random helpers ─────────────────────────────────────────────────────
function sr(seed: number, offset: number, min: number, max: number): number {
  const x = Math.sin(seed * 127.1 + offset * 311.7 + 1) * 43758.5;
  return min + Math.round((x - Math.floor(x)) * (max - min));
}
function srf(seed: number, offset: number, min: number, max: number, dp: number): number {
  const x = Math.sin(seed * 127.1 + offset * 311.7 + 1) * 43758.5;
  return parseFloat((min + (x - Math.floor(x)) * (max - min)).toFixed(dp));
}

// ── Types ─────────────────────────────────────────────────────────────────────
export type VitalRecord = {
  date: string;
  sbp: number; dbp: number; hr: number; rr: number;
  temp: number; o2: number; weight: number;
};

export type LabRecord = {
  date: string;
  wbc?: number; hgb?: number; plt?: number;
  na?: number; k?: number; cr?: number; egfr?: number;
  albumin?: number; tsh?: number;
  hba1c?: number; glucose?: number; inr?: number; ldl?: number; alt?: number;
};

export type Medication = {
  id: string; name: string; dose: string; route: string;
  times: string[]; prn: boolean;
  category?: "laxative" | "antipsychotic" | "other";
};

export type ProgressNote = {
  id: string; date: string;
  type: "Nurse" | "Physician" | "PT" | "OT" | "SW" | "Dietitian";
  author: string; text: string;
};

export type Immunization = { vaccine: string; dose: string; date: string; site: string };

export type FamilyQuestion = {
  id: string; residentId: number; residentName: string;
  familyName: string; date: string; question: string;
  status: "pending" | "forwarded" | "archived";
};

export type QIRow = {
  metric: string; total: number; highRisk: number;
  trend: "up" | "down" | "stable";
};

export type ResidentProfile = { pmhx: string; sochx: string; ap: string };

export type NLQResult = {
  label: string;
  columns: string[];
  rows: { residentId: number; name: string; room: string | null; values: string[] }[];
} | null;

// ── Vitals (36 monthly records) ────────────────────────────────────────────────
export function getMockVitals(residentId: number): VitalRecord[] {
  const now = new Date();
  return Array.from({ length: 36 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (35 - i), 15);
    return {
      date: d.toISOString().slice(0, 10),
      sbp: sr(residentId, i * 7, 108, 158),
      dbp: sr(residentId, i * 7 + 1, 62, 94),
      hr: sr(residentId, i * 7 + 2, 56, 96),
      rr: sr(residentId, i * 7 + 3, 13, 22),
      temp: srf(residentId, i * 7 + 4, 36.0, 37.9, 1),
      o2: sr(residentId, i * 7 + 5, 92, 99),
      weight: srf(residentId, i * 7 + 6, 50, 96, 1),
    };
  });
}

// ── Labs (8 quarterly records) ─────────────────────────────────────────────────
export function getMockLabs(residentId: number): LabRecord[] {
  const now = new Date();
  const isDiabetic = residentId % 4 === 0 || residentId % 7 === 0;
  const isOnWarfarin = residentId % 5 === 0;
  return Array.from({ length: 8 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (7 - i) * 3, 15);
    const rec: LabRecord = {
      date: d.toISOString().slice(0, 10),
      wbc: srf(residentId, i * 17, 3.8, 12.0, 1),
      hgb: sr(residentId, i * 17 + 1, 98, 158),
      plt: sr(residentId, i * 17 + 2, 145, 390),
      na: sr(residentId, i * 17 + 3, 134, 147),
      k: srf(residentId, i * 17 + 4, 3.3, 5.2, 1),
      cr: sr(residentId, i * 17 + 5, 58, 136),
      egfr: sr(residentId, i * 17 + 6, 32, 88),
      albumin: srf(residentId, i * 17 + 7, 28, 48, 1),
      tsh: srf(residentId, i * 17 + 8, 0.4, 5.5, 2),
      ldl: srf(residentId, i * 17 + 12, 1.4, 3.8, 1),
      alt: sr(residentId, i * 17 + 13, 12, 55),
    };
    if (isDiabetic) {
      rec.hba1c = srf(residentId, i * 17 + 9, 6.2, 10.1, 1);
      rec.glucose = sr(residentId, i * 17 + 10, 4, 13);
    }
    if (isOnWarfarin) rec.inr = srf(residentId, i * 17 + 11, 1.4, 4.1, 1);
    return rec;
  });
}

// ── Medications ────────────────────────────────────────────────────────────────
const MED_POOL: Medication[] = [
  { id: "amlo", name: "Amlodipine 5 mg", dose: "5 mg", route: "PO", times: ["0800"], prn: false, category: "other" },
  { id: "meto", name: "Metoprolol Succ. 25 mg", dose: "25 mg", route: "PO", times: ["0800"], prn: false, category: "other" },
  { id: "rami", name: "Ramipril 5 mg", dose: "5 mg", route: "PO", times: ["0800"], prn: false, category: "other" },
  { id: "furo", name: "Furosemide 40 mg", dose: "40 mg", route: "PO", times: ["0800", "1200"], prn: false, category: "other" },
  { id: "metf", name: "Metformin 500 mg", dose: "500 mg", route: "PO", times: ["0800", "1800"], prn: false, category: "other" },
  { id: "warf", name: "Warfarin (per INR)", dose: "per INR", route: "PO", times: ["1800"], prn: false, category: "other" },
  { id: "pant", name: "Pantoprazole 40 mg", dose: "40 mg", route: "PO", times: ["0800"], prn: false, category: "other" },
  { id: "done", name: "Donepezil 10 mg", dose: "10 mg", route: "PO", times: ["2200"], prn: false, category: "other" },
  { id: "mirt", name: "Mirtazapine 15 mg", dose: "15 mg", route: "PO", times: ["2200"], prn: false, category: "other" },
  { id: "acet", name: "Acetaminophen 500 mg", dose: "500 mg", route: "PO", times: ["0800", "1200", "1800"], prn: false, category: "other" },
  { id: "ator", name: "Atorvastatin 40 mg", dose: "40 mg", route: "PO", times: ["2200"], prn: false, category: "other" },
  { id: "lisi", name: "Lisinopril 10 mg", dose: "10 mg", route: "PO", times: ["0800"], prn: false, category: "other" },
  { id: "vita", name: "Vitamin D3 1000 IU", dose: "1000 IU", route: "PO", times: ["0800"], prn: false, category: "other" },
  { id: "calc", name: "Calcium Carbonate 500 mg", dose: "500 mg", route: "PO", times: ["0800", "1800"], prn: false, category: "other" },
  { id: "iron", name: "Ferrous Gluconate 300 mg", dose: "300 mg", route: "PO", times: ["1200"], prn: false, category: "other" },
  { id: "zopi", name: "Zopiclone 3.75 mg", dose: "3.75 mg", route: "PO", times: ["2200"], prn: true, category: "other" },
  { id: "risp", name: "Risperidone 0.5 mg", dose: "0.5 mg", route: "PO", times: ["0800", "1800"], prn: true, category: "antipsychotic" },
  { id: "quet", name: "Quetiapine 25 mg", dose: "25 mg", route: "PO", times: ["2200"], prn: true, category: "antipsychotic" },
  { id: "senn", name: "Sennoside 8.6 mg", dose: "8.6 mg", route: "PO", times: ["2200"], prn: true, category: "laxative" },
  { id: "lact", name: "Lactulose 30 mL", dose: "30 mL", route: "PO", times: ["0800"], prn: true, category: "laxative" },
  { id: "bisa", name: "Bisacodyl 5 mg", dose: "5 mg", route: "PO", times: ["0800"], prn: true, category: "laxative" },
];

export function getMockMeds(residentId: number): Medication[] {
  const regular = MED_POOL.filter(m => !m.prn);
  const prn = MED_POOL.filter(m => m.prn);
  const count = 5 + (residentId % 6);
  const picked = new Set<number>();
  for (let i = 0; i < count * 3 && picked.size < count; i++) {
    picked.add(sr(residentId, i * 13, 0, regular.length - 1));
  }
  const result: Medication[] = Array.from(picked).slice(0, count).map(i => regular[i]);
  if (residentId % 3 !== 0) {
    const laxatives = prn.filter(m => m.category === "laxative");
    result.push(laxatives[residentId % laxatives.length]);
  }
  if (residentId % 7 === 0 || residentId % 11 === 0) {
    const antipsychotics = prn.filter(m => m.category === "antipsychotic");
    result.push(antipsychotics[residentId % antipsychotics.length]);
  }
  return result;
}

export function getMockEmar(meds: Medication[], residentId: number): Record<string, Record<string, "given" | "missed" | "na">> {
  const result: Record<string, Record<string, "given" | "missed" | "na">> = {};
  const slots = ["0800", "1200", "1800", "2200"];
  meds.forEach((med, mi) => {
    result[med.id] = {};
    slots.forEach((slot, si) => {
      if (med.times.includes(slot)) {
        result[med.id][slot] = sr(residentId, mi * 7 + si, 0, 9) < 8 ? "given" : "missed";
      } else {
        result[med.id][slot] = "na";
      }
    });
  });
  return result;
}

// ── Progress Notes ─────────────────────────────────────────────────────────────
const NOTE_TEMPLATES: Record<string, ((n: string) => string)[]> = {
  Nurse: [
    n => `${n.split(" ")[0]} alert and oriented ×3. Completed morning ADLs with moderate assist. Appetite fair at breakfast. No acute complaints. Vital signs within normal limits. Skin intact.`,
    n => `Stage I pressure injury at coccyx — stable. Wound protocol in place, repositioning q2h. Dressing changed per protocol. Resident tolerated well.`,
    n => `${n.split(" ")[0]} reports 3/10 lower back pain. PRN acetaminophen 500 mg given at 0845. Pain reassessed at 1/10 post-medication. Resident comfortable and resting.`,
    n => `Increased agitation noted during afternoon. Redirected successfully with music therapy. Behaviour charted. Physician notified per protocol. No PRN medications required at this time.`,
    n => `Fluid intake monitored: 1,150 mL/24h — below 1,500 mL target. Encouraged oral fluids. Preferred beverages offered. Family notified of hydration concerns.`,
  ],
  Physician: [
    n => `${n.split(" ")[0]} assessed on rounds. Alert and oriented ×3. Vitals stable. Recent labs reviewed — no acute concerns. Continue current care plan. Follow-up next scheduled visit.`,
    n => `Medication review completed. PRN laxative use over past 14 days reviewed — bowel management plan updated. Statin dose optimized. Renal function monitoring ongoing.`,
    n => `Goals of care discussion held with SDM present. Current code status confirmed and documented. POLST form reviewed and updated. Family expressed understanding and agreement.`,
  ],
  PT: [
    n => `Balance assessment: ${n.split(" ")[0]} scores 38/56 on Berg Balance Scale — moderate fall risk. Lower extremity strengthening initiated 3×/week. Fall prevention strategies reviewed with care team.`,
    n => `Gait training session completed. Resident ambulating 20 m with standard walker and minimal assist. Transfer technique reviewed with care staff. Mobility improving.`,
  ],
  OT: [
    n => `ADL assessment complete. Self-feeding with rocker knife and plate guard — modified independence. MMSE 19/30 consistent with mild-moderate cognitive impairment. Cognitive activities added to schedule.`,
    n => `Home safety assessment simulation completed. Adaptive equipment (bath bench, grab bars) recommended. Occupational therapy goals updated. Family educated on adaptive strategies.`,
  ],
  SW: [
    n => `Family meeting: Goals of care reviewed with SDM. ${n.split(" ")[0]}'s expressed wishes documented. Grief counselling referral provided for family. Social support plan updated.`,
    n => `Resident expresses satisfaction with care environment. No immediate psychosocial concerns identified. Financial and legal affairs confirmed in order per family. Will monitor monthly.`,
  ],
  Dietitian: [
    n => `Nutritional assessment completed. BMI 21.5. Diet: pureed with thickened fluids. High-protein supplement TID recommended for wound healing support. Reassess in 4 weeks.`,
    n => `Weight trend: −2.1 kg over 3 months. Calorie count ordered for 3 days. Fortified foods incorporated. Resident encouraged to eat. Dietitian to follow up in 2 weeks.`,
  ],
};

const NOTE_AUTHORS: Record<string, string[]> = {
  Nurse: ["Jane Kowalski RN", "Maria Santos RN", "Tony Reyes RPN", "Sarah Obi RN"],
  Physician: ["Dr. Sarah Chang", "Dr. Raj Patel"],
  PT: ["Alex Tran PT", "Beth Kovacs PT"],
  OT: ["Chris Lee OT", "Dana Park OT"],
  SW: ["Emma Schulz MSW", "Frank Torres MSW"],
  Dietitian: ["Gina Reyes RD", "Hannah Kim RD"],
};

export function getMockNotes(residentId: number, name: string): ProgressNote[] {
  const types = ["Nurse", "Nurse", "Physician", "PT", "OT", "SW", "Dietitian", "Nurse", "Physician", "Nurse", "PT", "Dietitian"] as const;
  const now = Date.now();
  return types.map((type, i) => {
    const daysAgo = i === 0 ? 0.08 : i === 1 ? 0.4 : i * 2.8 + srf(residentId, i * 23, 0, 1.5, 1);
    const pool = NOTE_TEMPLATES[type];
    const text = pool[sr(residentId, i * 31, 0, pool.length - 1)](name);
    const authors = NOTE_AUTHORS[type];
    const author = authors[sr(residentId, i * 37, 0, authors.length - 1)];
    return { id: `n_${residentId}_${i}`, date: new Date(now - daysAgo * 86400000).toISOString(), type, author, text };
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// ── Immunizations ──────────────────────────────────────────────────────────────
export function getMockImmunizations(residentId: number): Immunization[] {
  const now = new Date();
  const yrsAgo = (n: number) => new Date(now.getFullYear() - n, sr(residentId, 200 + n, 0, 11), 15).toISOString().slice(0, 10);
  return [
    { vaccine: "Influenza (FLUCELVAX)", dose: "0.5 mL", date: yrsAgo(0), site: "L Deltoid IM" },
    { vaccine: "Pneumococcal (PCV15)", dose: "0.5 mL", date: yrsAgo(3), site: "R Deltoid IM" },
    { vaccine: "COVID-19 Booster (mRNA)", dose: "0.5 mL", date: yrsAgo(0), site: "L Deltoid IM" },
    { vaccine: "Shingrix Dose 2", dose: "0.5 mL", date: yrsAgo(2), site: "L Deltoid IM" },
    ...(residentId % 3 === 0 ? [{ vaccine: "Tdap (Adacel)", dose: "0.5 mL", date: yrsAgo(8), site: "R Deltoid IM" }] : []),
  ];
}

// ── Falls & PRN counts ─────────────────────────────────────────────────────────
export function getMockFalls(residentId: number): { date: string; description: string }[] {
  const count = [0, 0, 1, 0, 2, 0, 0, 1, 0, 3][residentId % 10];
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => ({
    date: new Date(now - sr(residentId, i * 50, 10, 355) * 86400000).toISOString().slice(0, 10),
    description: ["Unwitnessed fall in room", "Fall during transfer", "Fall in bathroom", "Fall in hallway"][i % 4],
  }));
}

export function getMockPRNLaxCount(residentId: number): number {
  return residentId % 3 === 0 ? 0 : sr(residentId, 77, 0, 8);
}

export function getMockPRNAntipsychoticCount(residentId: number): number {
  return (residentId % 7 === 0 || residentId % 11 === 0) ? sr(residentId, 88, 0, 5) : 0;
}

// ── Resident Profile (PMHx, SocHx, A&P) ───────────────────────────────────────
const PMHX = [
  "Hypertension, Type 2 Diabetes Mellitus, Atrial Fibrillation (rate-controlled), Osteoarthritis bilateral knees, Chronic kidney disease stage 3a",
  "Ischemic heart disease (CABG 2014), Congestive heart failure (EF 40%), COPD (mild, PRN inhaler), Major Depressive Disorder, Osteoporosis",
  "Dementia (moderate Alzheimer's type), Hypertension, Hypothyroidism, Chronic constipation, Dyslipidemia",
  "CVA with residual left hemiplegia (2019), Dysphagia (thickened fluids), Recurrent UTI, Pressure injury history, Generalized Anxiety Disorder",
  "Parkinson's disease (moderate), Lewy body dementia, Dysphagia, Orthostatic hypotension, REM sleep behaviour disorder",
];

const SOCHX = [
  "Retired schoolteacher. Widowed 2019. Three adult children actively involved in care. Non-smoker. Occasional wine prior to admission. Enjoys crossword puzzles and classical music.",
  "Former engineer. Married 48 years. Two children nearby. Ex-smoker (quit 1985, 20 pack-years). No alcohol. Devout Christian, finds prayer comforting. Enjoys woodworking reminiscence.",
  "Born in Jamaica, immigrated 1972. Retired nurse. Widowed. Strong family support (4 children). Non-smoker. Bilingual (English/Patois). Enjoys gospel music and bingo.",
  "Retired farmer. French-Canadian background, bilingual. Social drinker prior. Smoker (quit 2010, 30 pack-years). Enjoys hockey discussions and gardening.",
];

export function getMockProfile(residentId: number): ResidentProfile {
  return {
    pmhx: PMHX[residentId % PMHX.length],
    sochx: SOCHX[residentId % SOCHX.length],
    ap: "Stable on current regimen. Monitoring BP and renal function. Continue current medications. Bowel regimen optimized. Goals of care documented. Follow-up per routine schedule.",
  };
}

// ── QI Metrics ─────────────────────────────────────────────────────────────────
export function getQIMetrics(residentIds: number[]): QIRow[] {
  const n = residentIds.length;
  const falls = residentIds.filter(id => getMockFalls(id).length > 0).length;
  const lax = residentIds.filter(id => getMockPRNLaxCount(id) > 2).length;
  const ap = residentIds.filter(id => getMockPRNAntipsychoticCount(id) > 0).length;
  const poly = residentIds.filter(id => getMockMeds(id).length >= 8).length;
  return [
    { metric: "48-Hour BM Gaps", total: Math.round(n * 0.32), highRisk: Math.round(n * 0.12), trend: "stable" },
    { metric: "Bristol Type 1–2", total: Math.round(n * 0.18), highRisk: Math.round(n * 0.06), trend: "up" },
    { metric: "PRN Laxative Doses (14d)", total: lax, highRisk: Math.round(lax * 0.4), trend: "down" },
    { metric: "Polypharmacy (>8 meds)", total: poly, highRisk: Math.round(poly * 0.5), trend: "stable" },
    { metric: "Falls (Past 365 Days)", total: falls, highRisk: Math.round(falls * 0.35), trend: "stable" },
    { metric: "Pressure Ulcers", total: Math.round(n * 0.08), highRisk: Math.round(n * 0.03), trend: "down" },
    { metric: "Antipsychotic Use (PRN)", total: ap, highRisk: Math.round(ap * 0.6), trend: "up" },
  ];
}

// ── Family Questions (localStorage-persisted) ──────────────────────────────────
const Q_KEY = "ltc_family_questions_v3";

const INITIAL_QUESTIONS: FamilyQuestion[] = [
  { id: "fq1", residentId: 6, residentName: "Margaret Chen", familyName: "Jennifer Chen (Daughter)", date: new Date(Date.now() - 2 * 86400000).toISOString(), question: "Can you explain what the DNR order means for my mother? We want to make sure we fully understand the decision.", status: "forwarded" },
  { id: "fq2", residentId: 8, residentName: "Dorothy Williams", familyName: "Carlos Williams (Son)", date: new Date(Date.now() - 86400000).toISOString(), question: "My mother seems to be losing weight. Is her appetite being monitored? Are there dietary supplements that could help?", status: "pending" },
  { id: "fq3", residentId: 10, residentName: "Robert Martinez", familyName: "Sarah Martinez (Daughter)", date: new Date(Date.now() - 3 * 86400000).toISOString(), question: "Dad has been on an antipsychotic for 3 months now. Is there a plan to review whether he still needs it?", status: "forwarded" },
  { id: "fq4", residentId: 12, residentName: "Patricia Thompson", familyName: "Mark Thompson (Spouse)", date: new Date(Date.now() - 4 * 86400000).toISOString(), question: "Patricia fell last Tuesday. Can we schedule a family care conference to discuss fall prevention strategies?", status: "pending" },
  { id: "fq5", residentId: 14, residentName: "William Johnson", familyName: "Lisa Johnson (Daughter)", date: new Date(Date.now() - 12 * 3600000).toISOString(), question: "I noticed Dad seems more confused in the evenings. Is this being assessed? Could this be sundowning?", status: "pending" },
  { id: "fq6", residentId: 20, residentName: "Eleanor Davis", familyName: "Tom Davis (Son)", date: new Date(Date.now() - 6 * 86400000).toISOString(), question: "Eleanor's bowel movements have been irregular. What is being done? Should we bring fibre supplements from home?", status: "archived" },
  { id: "fq7", residentId: 24, residentName: "Charles Wilson", familyName: "Amy Wilson (Daughter)", date: new Date(Date.now() - 6 * 3600000).toISOString(), question: "Charles hasn't been eating well this week. Are we monitoring his fluid intake? We're worried about dehydration.", status: "pending" },
  { id: "fq8", residentId: 30, residentName: "Helen Anderson", familyName: "Brian Anderson (Son)", date: new Date(Date.now() - 2.5 * 86400000).toISOString(), question: "When is the next physician visit? We'd like to be present for the conversation about blood pressure medication changes.", status: "forwarded" },
];

export function getFamilyQuestions(): FamilyQuestion[] {
  try {
    const s = localStorage.getItem(Q_KEY);
    if (s) return JSON.parse(s) as FamilyQuestion[];
  } catch {}
  localStorage.setItem(Q_KEY, JSON.stringify(INITIAL_QUESTIONS));
  return [...INITIAL_QUESTIONS];
}

export function saveFamilyQuestions(qs: FamilyQuestion[]) {
  try { localStorage.setItem(Q_KEY, JSON.stringify(qs)); } catch {}
}

export function addFamilyQuestion(q: Omit<FamilyQuestion, "id" | "date" | "status">) {
  const qs = getFamilyQuestions();
  qs.unshift({ ...q, id: `fq_${Date.now()}`, date: new Date().toISOString(), status: "pending" });
  saveFamilyQuestions(qs);
}

// ── NLQ Processor ──────────────────────────────────────────────────────────────
export function processNLQ(
  query: string,
  residents: { residentId: number; name: string; room: string | null }[],
): NLQResult {
  const q = query.toLowerCase().trim();
  if (!q) return null;

  if (q.includes("a1c") || q.includes("hba1c") || q.includes("diabetes") || q.includes("glucose")) {
    const rows = residents.flatMap(r => {
      const lab = getMockLabs(r.residentId).filter(l => l.hba1c != null).at(-1);
      if (!lab) return [];
      const flag = lab.hba1c! > 8.0 ? "⚠️ High" : lab.hba1c! > 7.0 ? "Elevated" : "OK";
      return [{ residentId: r.residentId, name: r.name, room: r.room, values: [`${lab.hba1c}%`, lab.date, flag] }];
    }).sort((a, b) => parseFloat(b.values[0]) - parseFloat(a.values[0]));
    return { label: "Residents — HbA1c Results", columns: ["Name", "Room", "HbA1c", "Date", "Flag"], rows };
  }

  if (q.includes("fall")) {
    const rows = residents.flatMap(r => {
      const falls = getMockFalls(r.residentId);
      if (!falls.length) return [];
      return [{ residentId: r.residentId, name: r.name, room: r.room, values: [`${falls.length}`, falls[0].date] }];
    }).sort((a, b) => parseInt(b.values[0]) - parseInt(a.values[0]));
    return { label: "Residents with Falls — Past 365 Days", columns: ["Name", "Room", "Falls", "Most Recent"], rows };
  }

  if (q.includes("laxative") || q.includes("constip") || q.includes("bowel") || q.includes("bm gap")) {
    const rows = residents.flatMap(r => {
      const cnt = getMockPRNLaxCount(r.residentId);
      if (!cnt) return [];
      return [{ residentId: r.residentId, name: r.name, room: r.room, values: [`${cnt} doses`] }];
    }).sort((a, b) => parseInt(b.values[0]) - parseInt(a.values[0]));
    return { label: "Residents — PRN Laxative Use (Past 14 Days)", columns: ["Name", "Room", "PRN Doses"], rows };
  }

  if (q.includes("antipsychotic") || q.includes("psych") || q.includes("quetiapine") || q.includes("risperidone")) {
    const rows = residents.flatMap(r => {
      const cnt = getMockPRNAntipsychoticCount(r.residentId);
      if (!cnt) return [];
      return [{ residentId: r.residentId, name: r.name, room: r.room, values: [`${cnt} doses`] }];
    }).sort((a, b) => parseInt(b.values[0]) - parseInt(a.values[0]));
    return { label: "Residents — PRN Antipsychotic Use (Past 14 Days)", columns: ["Name", "Room", "PRN Doses"], rows };
  }

  if (q.includes("weight")) {
    const rows = residents.map(r => {
      const v = getMockVitals(r.residentId);
      const now = v.at(-1)!; const prev = v.at(-4)!;
      const delta = parseFloat((now.weight - prev.weight).toFixed(1));
      return { residentId: r.residentId, name: r.name, room: r.room, values: [`${now.weight} kg`, `${delta > 0 ? "+" : ""}${delta} kg`] };
    }).filter(r => Math.abs(parseFloat(r.values[1])) >= 2).sort((a, b) => parseFloat(a.values[1]) - parseFloat(b.values[1]));
    return { label: "Residents — Significant Weight Change (3 months)", columns: ["Name", "Room", "Weight", "3mo Change"], rows };
  }

  if (q.includes("cholesterol") || q.includes("ldl") || q.includes("lipid")) {
    const rows = residents.map(r => {
      const lab = getMockLabs(r.residentId).at(-1)!;
      const flag = lab.ldl! > 3.0 ? "⚠️ High" : lab.ldl! > 2.0 ? "Borderline" : "OK";
      return { residentId: r.residentId, name: r.name, room: r.room, values: [`${lab.ldl} mmol/L`, flag] };
    }).sort((a, b) => parseFloat(b.values[0]) - parseFloat(a.values[0]));
    return { label: "Residents — LDL Cholesterol (Most Recent)", columns: ["Name", "Room", "LDL", "Flag"], rows };
  }

  // Default: all residents
  return {
    label: `Search results for "${query}" — showing all residents`,
    columns: ["Name", "Room"],
    rows: residents.map(r => ({ residentId: r.residentId, name: r.name, room: r.room, values: [] })),
  };
}
