import { useState, useEffect } from "react";
import { BookOpen, MessageSquare, Send, Check, ChevronRight, Heart, Scale, Pill, HelpCircle, FileText } from "lucide-react";
import { getFamilyQuestions, addFamilyQuestion, saveFamilyQuestions } from "@/data/mockData";
import type { FamilyQuestion } from "@/data/mockData";

// ── Education Library ──────────────────────────────────────────────────────────
const ED_CARDS = [
  {
    icon: <Heart className="w-7 h-7 text-rose-400" />,
    title: "Goals of Care",
    tag: "GOC",
    colour: "border-rose-500/30 bg-rose-900/10",
    summary: "Understanding goals of care conversations and how to participate in care planning for your loved one.",
    body: `Goals of Care (GOC) conversations help families and care teams align on what matters most. They cover: wishes for life-sustaining treatment, preferred place of care, comfort-focused vs. aggressive intervention, and documenting preferences via POLST or advance directives.\n\nWe encourage all family members to engage in scheduled care conferences. Speak to the unit nurse to arrange a meeting with the attending physician.`,
  },
  {
    icon: <BookOpen className="w-7 h-7 text-amber-400" />,
    title: "End of Life Care",
    tag: "EOL",
    colour: "border-amber-500/30 bg-amber-900/10",
    summary: "Guidance on palliative and end-of-life care — what to expect and how we support residents and families.",
    body: `When curative treatment is no longer the focus, palliative care optimizes comfort and quality of life. Our team provides: symptom management (pain, breathlessness, anxiety), emotional and spiritual support, family presence and guidance, and coordination with hospice services when appropriate.\n\nSigns that end of life may be approaching include: decreased appetite and thirst, increased sleep, withdrawal from surroundings, and changes in breathing. Our staff will keep you informed and supported throughout.`,
  },
  {
    icon: <Pill className="w-7 h-7 text-violet-400" />,
    title: "Antipsychotics in LTC",
    tag: "MEDICATION",
    colour: "border-violet-500/30 bg-violet-900/10",
    summary: "Why antipsychotics are sometimes used in dementia care, the risks involved, and ongoing review processes.",
    body: `Antipsychotic medications (e.g., risperidone, quetiapine) may be prescribed for Behavioural and Psychological Symptoms of Dementia (BPSD) such as aggression or severe agitation when non-pharmacological approaches have been exhausted.\n\nImportant points: These are reviewed regularly for ongoing need. We follow provincial guidelines for gradual dose reduction (GDR). Families have the right to be involved in these decisions. Please ask the attending physician about your loved one's current antipsychotic use.`,
  },
  {
    icon: <Scale className="w-7 h-7 text-sky-400" />,
    title: "Deprescribing",
    tag: "MEDICATION",
    colour: "border-sky-500/30 bg-sky-900/10",
    summary: "What deprescribing means, why it matters in older adults, and how we safely reduce unnecessary medications.",
    body: `Deprescribing is the supervised process of reducing or stopping medications that may no longer be needed or that carry more risk than benefit for older adults.\n\nCommon targets in LTC: statins (in advanced dementia/late-stage illness), proton pump inhibitors, sleep aids, blood pressure medications (if BP runs low), and antidiabetics (if A1C is very low).\n\nOur pharmacist reviews each resident's medication list regularly. If you have concerns about your loved one's medications, speak with the nursing staff or request a meeting with the attending physician.`,
  },
  {
    icon: <FileText className="w-7 h-7 text-emerald-400" />,
    title: "Disability Tax Credit",
    tag: "FINANCIAL",
    colour: "border-emerald-500/30 bg-emerald-900/10",
    summary: "Information on the federal Disability Tax Credit and how it may apply to your family member in long-term care.",
    body: `The Disability Tax Credit (DTC) is a non-refundable federal tax credit that reduces the amount of income tax a person with a severe and prolonged impairment may owe.\n\nEligibility: The resident must have a severe and prolonged impairment in physical or mental functions (e.g., walking, feeding, dressing, mental functions necessary for everyday life).\n\nMany LTC residents qualify. Our social worker can connect you with resources and the attending physician can complete the T2201 medical certification form. The CRA processes applications — speak to our social worker to get started.`,
  },
  {
    icon: <HelpCircle className="w-7 h-7 text-teal-400" />,
    title: "Understanding LTC",
    tag: "GENERAL",
    colour: "border-teal-500/30 bg-teal-900/10",
    summary: "An overview of daily life in long-term care, staffing, visiting guidelines, and how to be your loved one's advocate.",
    body: `Long-term care homes provide 24-hour supervised care for residents who can no longer be safely cared for at home. Staff include Registered Nurses, Registered Practical Nurses, Personal Support Workers, and allied health professionals (PT, OT, SW, Dietitian).\n\nYour role as a family member is valued. You are a key partner in care. Tips for being an effective advocate: Attend care conferences, communicate concerns early, use the family communication binder to send messages to the care team, and ask questions — no question is too small.`,
  },
];

function EducationCard({ card }: { card: typeof ED_CARDS[0] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={["rounded-xl border p-5 transition-all", card.colour, open ? "shadow-lg" : ""].join(" ")}>
      <button
        className="w-full text-left"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="shrink-0">{card.icon}</div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">{card.tag}</span>
              <h3 className="text-base font-bold text-foreground leading-tight">{card.title}</h3>
            </div>
          </div>
          <ChevronRight className={["w-4 h-4 text-muted-foreground shrink-0 mt-1 transition-transform", open ? "rotate-90" : ""].join(" ")} />
        </div>
        {!open && <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{card.summary}</p>}
      </button>
      {open && (
        <div className="mt-4 space-y-3">
          {card.body.split("\n\n").map((para, i) => (
            <p key={i} className="text-sm text-foreground/85 leading-relaxed">{para}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Communication Module ───────────────────────────────────────────────────────
const RESIDENT_NAMES = [
  "Margaret Chen", "James Okafor", "Dorothy Williams", "Robert Martinez",
  "Patricia Thompson", "William Johnson", "Barbara Jackson", "Richard Taylor",
  "Susan Moore", "Joseph Anderson", "Jessica Thomas", "Charles Wilson",
];

function CommunicationModule() {
  const [familyName, setFamilyName] = useState("");
  const [selectedResident, setSelectedResident] = useState("");
  const [question, setQuestion] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const canSubmit = familyName.trim() && selectedResident && question.trim().length >= 10;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const residentId = 6 + RESIDENT_NAMES.indexOf(selectedResident);
    addFamilyQuestion({
      residentId: residentId >= 6 ? residentId : 6,
      residentName: selectedResident,
      familyName: familyName.trim(),
      question: question.trim(),
    });
    setSubmitted(true);
    setTimeout(() => { setSubmitted(false); setFamilyName(""); setSelectedResident(""); setQuestion(""); }, 4000);
  };

  if (submitted) {
    return (
      <div className="rounded-xl border border-emerald-500/40 bg-emerald-900/20 p-8 flex flex-col items-center gap-4 text-center">
        <div className="bg-emerald-500/20 rounded-full p-4">
          <Check className="w-8 h-8 text-emerald-400" />
        </div>
        <div>
          <p className="font-bold text-emerald-300 text-lg">Message Submitted</p>
          <p className="text-emerald-400/70 text-sm mt-1">Your question has been received by the care team and will be reviewed shortly.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Your Name</label>
          <input
            type="text"
            value={familyName}
            onChange={e => setFamilyName(e.target.value)}
            placeholder="e.g. Jennifer Chen (Daughter)"
            className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Resident Name</label>
          <select
            value={selectedResident}
            onChange={e => setSelectedResident(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">Select resident...</option>
            {RESIDENT_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Your Question or Concern</label>
        <textarea
          value={question}
          onChange={e => setQuestion(e.target.value)}
          rows={5}
          placeholder="Describe your question or concern. The care team will review and respond. For urgent matters, please call the unit directly."
          className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none leading-relaxed"
        />
        <p className="text-xs text-muted-foreground text-right">{question.length} characters</p>
      </div>

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Send className="w-4 h-4" />
        Submit Question to Care Team
      </button>

      <p className="text-xs text-muted-foreground text-center">
        Your message will appear in the care team's communication binder. This is not for emergencies — call 911 for medical emergencies.
      </p>
    </div>
  );
}

// ── My Submitted Questions ─────────────────────────────────────────────────────
function MyQuestions() {
  const [questions, setQuestions] = useState<FamilyQuestion[]>([]);

  useEffect(() => {
    setQuestions(getFamilyQuestions().filter(q => q.status !== "archived"));
  }, []);

  if (!questions.length) return <p className="text-muted-foreground text-sm text-center py-6">No questions submitted yet.</p>;

  return (
    <div className="space-y-3">
      {questions.slice(0, 5).map(q => (
        <div key={q.id} className="rounded-xl border border-border bg-background/50 p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-foreground">{q.residentName}</span>
            <span className={[
              "text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full",
              q.status === "forwarded" ? "bg-sky-900/40 text-sky-300 border border-sky-500/30"
                : "bg-amber-900/30 text-amber-400 border border-amber-500/30",
            ].join(" ")}>
              {q.status === "forwarded" ? "Forwarded to Physician" : "Under Review"}
            </span>
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed">{q.question}</p>
          <p className="text-xs text-muted-foreground font-mono">{new Date(q.date).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}</p>
        </div>
      ))}
    </div>
  );
}

// ── Family View Root ───────────────────────────────────────────────────────────
type Tab = "education" | "communicate" | "status";

export default function FamilyView() {
  const [tab, setTab] = useState<Tab>("education");

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "education", label: "Education Library", icon: <BookOpen className="w-4 h-4" /> },
    { key: "communicate", label: "Submit Question", icon: <MessageSquare className="w-4 h-4" /> },
    { key: "status", label: "My Questions", icon: <Send className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 bg-card border-b border-border px-6 py-4 shadow-sm">
        <h1 className="text-lg font-bold text-foreground">Family Portal</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Resources and communication for families of residents</p>
      </header>

      {/* Tabs */}
      <div className="sticky top-[65px] z-20 bg-background border-b border-border px-6">
        <div className="max-w-4xl mx-auto flex gap-1 py-2">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={[
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors",
                tab === t.key
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
              ].join(" ")}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {tab === "education" && (
          <div className="space-y-4">
            <div className="mb-6">
              <h2 className="text-base font-bold text-foreground">Education Library</h2>
              <p className="text-sm text-muted-foreground mt-1">Click any card to expand and read more about topics relevant to long-term care.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {ED_CARDS.map(card => <EducationCard key={card.title} card={card} />)}
            </div>
          </div>
        )}

        {tab === "communicate" && (
          <div className="max-w-xl">
            <div className="mb-6">
              <h2 className="text-base font-bold text-foreground">Submit a Question or Concern</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Your message will be delivered directly to the care team's communication binder and reviewed by nursing staff.
                Questions marked as requiring physician attention will be forwarded to the attending physician.
              </p>
            </div>
            <CommunicationModule />
          </div>
        )}

        {tab === "status" && (
          <div>
            <div className="mb-6">
              <h2 className="text-base font-bold text-foreground">Submitted Questions</h2>
              <p className="text-sm text-muted-foreground mt-1">Track the status of questions you've submitted to the care team.</p>
            </div>
            <MyQuestions />
          </div>
        )}
      </main>
    </div>
  );
}
