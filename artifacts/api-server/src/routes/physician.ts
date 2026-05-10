import { Router, type IRouter } from "express";
import { desc, and, gte, eq, sql, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  bowelMovementsTable,
  residentsTable,
  painEventsTable,
  behaviorEventsTable,
  fallEventsTable,
  vitalEventsTable,
  medicationTrackersTable,
} from "@workspace/db";
import { GetPhysicianSummaryResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/physician/summary", async (req, res): Promise<void> => {
  const now = new Date();
  const h24ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const h48ago = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const residents = await db
    .select()
    .from(residentsTable)
    .orderBy(residentsTable.room);

  const residentSummaries = await Promise.all(
    residents.map(async (resident) => {
      const rid = resident.id;

      const [
        [latestBM],
        monthlyBMs,
        severePainRows,
        behaviorCountRows,
        fallRows,
        abnormalVitalRows,
        taperRows,
      ] = await Promise.all([
        // Latest BM for gap calculation
        db
          .select({ createdAt: bowelMovementsTable.createdAt })
          .from(bowelMovementsTable)
          .where(eq(bowelMovementsTable.residentId, rid))
          .orderBy(desc(bowelMovementsTable.createdAt))
          .limit(1),

        // Monthly BMs for gap/blood stats
        db
          .select({
            createdAt: bowelMovementsTable.createdAt,
            bloodPresent: bowelMovementsTable.bloodPresent,
          })
          .from(bowelMovementsTable)
          .where(and(
            eq(bowelMovementsTable.residentId, rid),
            gte(bowelMovementsTable.createdAt, monthStart),
          ))
          .orderBy(bowelMovementsTable.createdAt),

        // Severe pain in last 24h
        db
          .select({ id: painEventsTable.id })
          .from(painEventsTable)
          .where(and(
            eq(painEventsTable.residentId, rid),
            eq(painEventsTable.severity, "Severe"),
            gte(painEventsTable.createdAt, h24ago),
          ))
          .limit(1),

        // Behavior event count in last 24h
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(behaviorEventsTable)
          .where(and(
            eq(behaviorEventsTable.residentId, rid),
            gte(behaviorEventsTable.createdAt, h24ago),
          )),

        // Any fall in last 24h
        db
          .select({ id: fallEventsTable.id })
          .from(fallEventsTable)
          .where(and(
            eq(fallEventsTable.residentId, rid),
            gte(fallEventsTable.createdAt, h24ago),
          ))
          .limit(1),

        // Any abnormal vital in last 24h
        db
          .select({ id: vitalEventsTable.id })
          .from(vitalEventsTable)
          .where(and(
            eq(vitalEventsTable.residentId, rid),
            eq(vitalEventsTable.isAbnormalFlag, true),
            gte(vitalEventsTable.createdAt, h24ago),
          ))
          .limit(1),

        // Taper/deprescribing status for this resident
        db
          .select({ status: medicationTrackersTable.status, orderedAt: medicationTrackersTable.orderedAt })
          .from(medicationTrackersTable)
          .where(and(
            eq(medicationTrackersTable.residentId, rid),
            inArray(medicationTrackersTable.status, ["Ordered", "Active Taper"]),
          )),
      ]);

      // BM alert level
      const lastBMAt = latestBM?.createdAt ?? null;
      const hoursSinceLastBM = lastBMAt
        ? (now.getTime() - new Date(lastBMAt).getTime()) / (1000 * 60 * 60)
        : null;

      let alertLevel: "none" | "amber" | "red" = "none";
      if (hoursSinceLastBM === null || hoursSinceLastBM >= 72) alertLevel = "red";
      else if (hoursSinceLastBM >= 48) alertLevel = "amber";

      // Monthly BM gap / blood stats
      let monthlyGapCount = 0;
      let monthlyBloodCount = 0;
      let prevBMTime: Date | null = null;
      for (const bm of monthlyBMs) {
        if (bm.bloodPresent) monthlyBloodCount++;
        if (prevBMTime) {
          const gapHours = (new Date(bm.createdAt).getTime() - prevBMTime.getTime()) / (1000 * 60 * 60);
          if (gapHours >= 48) monthlyGapCount++;
        }
        prevBMTime = new Date(bm.createdAt);
      }

      const hasTaperActive = taperRows.some((t) => t.status === "Active Taper");
      const hasTaperUnconfirmed = taperRows.some(
        (t) => t.status === "Ordered" && new Date(t.orderedAt) <= h48ago,
      );

      return {
        residentId: rid,
        name: resident.name,
        room: resident.room,
        phn: resident.phn ?? null,
        dob: resident.dob ?? null,
        codeStatus: resident.codeStatus ?? null,
        allergies: resident.allergies ?? [],
        infectionFlags: resident.infectionFlags ?? [],
        sdmName: resident.sdmName ?? null,
        sdmRelation: resident.sdmRelation ?? null,
        sdmPhone: resident.sdmPhone ?? null,
        alertLevel,
        lastBMAt: lastBMAt ? new Date(lastBMAt) : null,
        hoursSinceLastBM,
        monthlyGapCount,
        monthlyBloodCount,
        hasSeverePain: severePainRows.length > 0,
        behaviorEventCount24h: behaviorCountRows[0]?.count ?? 0,
        hasFall24h: fallRows.length > 0,
        hasAbnormalVital24h: abnormalVitalRows.length > 0,
        hasTaperActive,
        hasTaperUnconfirmed,
      };
    }),
  );

  const facilityMonthlyGaps = residentSummaries.reduce((s, r) => s + r.monthlyGapCount, 0);
  const facilityMonthlyBlood = residentSummaries.reduce((s, r) => s + r.monthlyBloodCount, 0);

  res.json(
    GetPhysicianSummaryResponse.parse({
      residents: residentSummaries,
      facilityMonthlyGaps,
      facilityMonthlyBlood,
      generatedAt: now,
    }),
  );
});

export default router;
