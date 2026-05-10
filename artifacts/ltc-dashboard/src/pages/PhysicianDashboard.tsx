import { useGetPhysicianSummary, getGetPhysicianSummaryQueryKey } from "@workspace/api-client-react";
import { Clock, RefreshCw, AlertTriangle, Droplets, CalendarX } from "lucide-react";
import { useState, useEffect } from "react";

function formatHours(hours: number | null): string {
  if (hours === null) return "No record";
  if (hours < 1) return "< 1 hour ago";
  if (hours < 24) return `${Math.round(hours)}h ago`;
  const days = Math.floor(hours / 24);
  const remainingHours = Math.round(hours % 24);
  return remainingHours > 0 ? `${days}d ${remainingHours}h ago` : `${days}d ago`;
}

function formatLastBM(lastBMAt: string | Date | null): string {
  if (!lastBMAt) return "Never recorded";
  return new Date(lastBMAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export default function PhysicianDashboard() {
  const [time, setTime] = useState(new Date());
  const { data, isLoading, isError, refetch, isFetching } = useGetPhysicianSummary({
    query: { refetchInterval: 60_000, queryKey: getGetPhysicianSummaryQueryKey() },
  });

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const alertCounts = data
    ? {
        red: data.residents.filter((r) => r.alertLevel === "red").length,
        amber: data.residents.filter((r) => r.alertLevel === "amber").length,
        none: data.residents.filter((r) => r.alertLevel === "none").length,
      }
    : null;

  const monthName = time.toLocaleString("en-US", { month: "long" });

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border px-6 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg text-foreground">Physician View</span>
            <span className="text-muted-foreground text-sm">— Population Health</span>
          </div>
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

      <main className="max-w-7xl mx-auto p-8 space-y-8">
        {/* Alert Summary Cards */}
        {alertCounts && (
          <section className="grid grid-cols-3 gap-4">
            <div className="bg-card border-2 border-red-600/40 rounded-xl p-5 flex items-center gap-4" data-testid="card-alert-red">
              <div className="bg-red-600/15 p-3 rounded-full">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <p className="text-3xl font-bold text-red-500">{alertCounts.red}</p>
                <p className="text-sm text-muted-foreground uppercase tracking-wider font-medium">Over 72 Hours</p>
              </div>
            </div>
            <div className="bg-card border-2 border-amber-500/40 rounded-xl p-5 flex items-center gap-4" data-testid="card-alert-amber">
              <div className="bg-amber-500/15 p-3 rounded-full">
                <AlertTriangle className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <p className="text-3xl font-bold text-amber-400">{alertCounts.amber}</p>
                <p className="text-sm text-muted-foreground uppercase tracking-wider font-medium">48–72 Hours</p>
              </div>
            </div>
            <div className="bg-card border-2 border-emerald-500/40 rounded-xl p-5 flex items-center gap-4" data-testid="card-alert-none">
              <div className="bg-emerald-500/15 p-3 rounded-full">
                <AlertTriangle className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <p className="text-3xl font-bold text-emerald-400">{alertCounts.none}</p>
                <p className="text-sm text-muted-foreground uppercase tracking-wider font-medium">Within 48 Hours</p>
              </div>
            </div>
          </section>
        )}

        {/* Resident Summary Table */}
        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Resident Status — All Residents
          </h2>

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
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <table className="w-full" data-testid="table-residents">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-6 py-4 text-xs uppercase tracking-widest text-muted-foreground font-bold">
                      Alert
                    </th>
                    <th className="text-left px-6 py-4 text-xs uppercase tracking-widest text-muted-foreground font-bold">
                      Resident
                    </th>
                    <th className="text-left px-6 py-4 text-xs uppercase tracking-widest text-muted-foreground font-bold">
                      Room
                    </th>
                    <th className="text-left px-6 py-4 text-xs uppercase tracking-widest text-muted-foreground font-bold">
                      Last BM
                    </th>
                    <th className="text-left px-6 py-4 text-xs uppercase tracking-widest text-muted-foreground font-bold">
                      Elapsed
                    </th>
                    <th className="text-center px-6 py-4 text-xs uppercase tracking-widest text-muted-foreground font-bold">
                      48h Gaps (Mo.)
                    </th>
                    <th className="text-center px-6 py-4 text-xs uppercase tracking-widest text-muted-foreground font-bold">
                      Blood Events (Mo.)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.residents.map((resident, idx) => {
                    const isRed = resident.alertLevel === "red";
                    const isAmber = resident.alertLevel === "amber";
                    const rowBg = isRed
                      ? "bg-red-950/40"
                      : isAmber
                      ? "bg-amber-950/30"
                      : "";
                    const nameCls = isRed
                      ? "text-red-400 font-bold"
                      : isAmber
                      ? "text-amber-400 font-bold"
                      : "text-foreground font-semibold";
                    const alertDot = isRed
                      ? "bg-red-500"
                      : isAmber
                      ? "bg-amber-400"
                      : "bg-emerald-500";

                    return (
                      <tr
                        key={resident.residentId}
                        data-testid={`row-resident-${resident.residentId}`}
                        className={[
                          rowBg,
                          idx < data.residents.length - 1 ? "border-b border-border/50" : "",
                          "transition-colors",
                        ].join(" ")}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center">
                            <span
                              className={["w-3 h-3 rounded-full", alertDot].join(" ")}
                              data-testid={`alert-dot-${resident.residentId}`}
                            />
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span className={nameCls} data-testid={`name-resident-${resident.residentId}`}>
                            {resident.name}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-muted-foreground font-mono">
                          {resident.room}
                        </td>
                        <td className="px-6 py-5 text-sm text-muted-foreground font-mono">
                          {formatLastBM(resident.lastBMAt)}
                        </td>
                        <td className="px-6 py-5">
                          <span
                            className={[
                              "text-sm font-semibold font-mono",
                              isRed ? "text-red-400" : isAmber ? "text-amber-400" : "text-muted-foreground",
                            ].join(" ")}
                          >
                            {formatHours(resident.hoursSinceLastBM)}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-center">
                          <span
                            className={[
                              "text-lg font-bold",
                              resident.monthlyGapCount > 0 ? "text-amber-400" : "text-muted-foreground",
                            ].join(" ")}
                          >
                            {resident.monthlyGapCount}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-center">
                          <span
                            className={[
                              "text-lg font-bold",
                              resident.monthlyBloodCount > 0 ? "text-red-400" : "text-muted-foreground",
                            ].join(" ")}
                          >
                            {resident.monthlyBloodCount}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Monthly Facility Stats */}
        {data && (
          <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Facility Statistics — {monthName} {time.getFullYear()}
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div
                className="bg-card border-2 border-amber-500/30 rounded-xl p-6 flex items-center gap-5"
                data-testid="stat-monthly-gaps"
              >
                <div className="bg-amber-500/15 p-4 rounded-full">
                  <CalendarX className="w-7 h-7 text-amber-400" />
                </div>
                <div>
                  <p className="text-4xl font-bold text-amber-400">{data.facilityMonthlyGaps}</p>
                  <p className="text-sm text-muted-foreground font-medium mt-1">
                    48-hour gaps this month
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">
                    Intervals between BMs exceeding 48 hours
                  </p>
                </div>
              </div>
              <div
                className="bg-card border-2 border-red-600/30 rounded-xl p-6 flex items-center gap-5"
                data-testid="stat-monthly-blood"
              >
                <div className="bg-red-600/15 p-4 rounded-full">
                  <Droplets className="w-7 h-7 text-red-500" />
                </div>
                <div>
                  <p className="text-4xl font-bold text-red-500">{data.facilityMonthlyBlood}</p>
                  <p className="text-sm text-muted-foreground font-medium mt-1">
                    Blood present events this month
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">
                    Facility-wide across all residents
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
