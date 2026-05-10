import { Router, type IRouter } from "express";
import { desc, and, gte, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { bowelMovementsTable, residentsTable } from "@workspace/db";
import { GetPhysicianSummaryResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/physician/summary", async (req, res): Promise<void> => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const residents = await db
    .select()
    .from(residentsTable)
    .orderBy(residentsTable.room);

  const residentSummaries = await Promise.all(
    residents.map(async (resident) => {
      const [latestBM] = await db
        .select({ createdAt: bowelMovementsTable.createdAt })
        .from(bowelMovementsTable)
        .where(eq(bowelMovementsTable.residentId, resident.id))
        .orderBy(desc(bowelMovementsTable.createdAt))
        .limit(1);

      const lastBMAt = latestBM?.createdAt ?? null;
      const hoursSinceLastBM = lastBMAt
        ? (now.getTime() - new Date(lastBMAt).getTime()) / (1000 * 60 * 60)
        : null;

      let alertLevel: "none" | "amber" | "red" = "none";
      if (hoursSinceLastBM === null || hoursSinceLastBM >= 72) {
        alertLevel = "red";
      } else if (hoursSinceLastBM >= 48) {
        alertLevel = "amber";
      }

      const monthlyBMs = await db
        .select({
          createdAt: bowelMovementsTable.createdAt,
          bloodPresent: bowelMovementsTable.bloodPresent,
        })
        .from(bowelMovementsTable)
        .where(
          and(
            eq(bowelMovementsTable.residentId, resident.id),
            gte(bowelMovementsTable.createdAt, monthStart),
          ),
        )
        .orderBy(bowelMovementsTable.createdAt);

      let monthlyGapCount = 0;
      let monthlyBloodCount = 0;
      let prevBMTime: Date | null = null;

      for (const bm of monthlyBMs) {
        if (bm.bloodPresent) monthlyBloodCount++;
        if (prevBMTime) {
          const gapHours =
            (new Date(bm.createdAt).getTime() - prevBMTime.getTime()) /
            (1000 * 60 * 60);
          if (gapHours >= 48) monthlyGapCount++;
        }
        prevBMTime = new Date(bm.createdAt);
      }

      return {
        residentId: resident.id,
        name: resident.name,
        room: resident.room,
        alertLevel,
        lastBMAt: lastBMAt ? new Date(lastBMAt) : null,
        hoursSinceLastBM,
        monthlyGapCount,
        monthlyBloodCount,
      };
    }),
  );

  const facilityMonthlyGaps = residentSummaries.reduce(
    (sum, r) => sum + r.monthlyGapCount,
    0,
  );
  const facilityMonthlyBlood = residentSummaries.reduce(
    (sum, r) => sum + r.monthlyBloodCount,
    0,
  );

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
