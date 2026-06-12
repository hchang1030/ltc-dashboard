import { Router, type IRouter } from "express";
import { eq, gte, and, count } from "drizzle-orm";
import { db } from "@workspace/db";
import { residentsTable, fallEventsTable, medicationTrackersTable } from "@workspace/db";
import {
  ListResidentsResponse,
  ListResidentsResponseItem,
  ToggleFavoriteBody,
  ToggleFavoriteParams,
  UpdateResidentDemographicsParams,
  UpdateResidentDemographicsBody,
  UpdateResidentStabilityParams,
  UpdateResidentStabilityBody,
  UpdateResidentStabilityResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/residents", async (req, res): Promise<void> => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);

  const [rows, fallCounts, medCounts] = await Promise.all([
    db.select().from(residentsTable).orderBy(residentsTable.room),
    db
      .select({ residentId: fallEventsTable.residentId, cnt: count() })
      .from(fallEventsTable)
      .where(gte(fallEventsTable.createdAt, cutoff))
      .groupBy(fallEventsTable.residentId),
    db
      .select({ residentId: medicationTrackersTable.residentId, cnt: count() })
      .from(medicationTrackersTable)
      .where(gte(medicationTrackersTable.orderedAt, cutoff))
      .groupBy(medicationTrackersTable.residentId),
  ]);

  const fallMap = new Map(fallCounts.map((r) => [r.residentId, Number(r.cnt)]));
  const medMap = new Map(medCounts.map((r) => [r.residentId, Number(r.cnt)]));

  const residents = rows.map((r) => ({
    ...r,
    allergies: r.allergies ?? [],
    infectionFlags: r.infectionFlags ?? [],
    recentFallCount: fallMap.get(r.id) ?? 0,
    recentMedChangeCount: medMap.get(r.id) ?? 0,
  }));

  res.json(ListResidentsResponse.parse(residents));
});

router.patch("/residents/:residentId/stability", async (req, res): Promise<void> => {
  const params = UpdateResidentStabilityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateResidentStabilityBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);

  const [updated, fallCounts, medCounts] = await Promise.all([
    db
      .update(residentsTable)
      .set({ stabilityStatus: body.data.status })
      .where(eq(residentsTable.id, params.data.residentId))
      .returning()
      .then((rows) => rows[0]),
    db
      .select({ cnt: count() })
      .from(fallEventsTable)
      .where(
        and(
          eq(fallEventsTable.residentId, params.data.residentId),
          gte(fallEventsTable.createdAt, cutoff),
        ),
      ),
    db
      .select({ cnt: count() })
      .from(medicationTrackersTable)
      .where(
        and(
          eq(medicationTrackersTable.residentId, params.data.residentId),
          gte(medicationTrackersTable.orderedAt, cutoff),
        ),
      ),
  ]);

  if (!updated) {
    res.status(404).json({ error: "Resident not found" });
    return;
  }

  req.log.info({ residentId: updated.id, stabilityStatus: updated.stabilityStatus }, "Stability updated");

  res.json(
    UpdateResidentStabilityResponse.parse({
      ...updated,
      allergies: updated.allergies ?? [],
      infectionFlags: updated.infectionFlags ?? [],
      recentFallCount: Number(fallCounts[0]?.cnt ?? 0),
      recentMedChangeCount: Number(medCounts[0]?.cnt ?? 0),
    }),
  );
});

router.patch("/residents/:residentId/demographics", async (req, res): Promise<void> => {
  const params = UpdateResidentDemographicsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateResidentDemographicsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [updated] = await db
    .update(residentsTable)
    .set({
      codeStatus: body.data.codeStatus ?? null,
      allergies: body.data.allergies ?? null,
      infectionFlags: body.data.infectionFlags ?? null,
      sdmName: body.data.sdmName ?? null,
      sdmRelation: body.data.sdmRelation ?? null,
      sdmPhone: body.data.sdmPhone ?? null,
    })
    .where(eq(residentsTable.id, params.data.residentId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Resident not found" });
    return;
  }

  req.log.info({ residentId: updated.id }, "Demographics updated");

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);
  const [fallCounts, medCounts] = await Promise.all([
    db
      .select({ cnt: count() })
      .from(fallEventsTable)
      .where(and(eq(fallEventsTable.residentId, updated.id), gte(fallEventsTable.createdAt, cutoff))),
    db
      .select({ cnt: count() })
      .from(medicationTrackersTable)
      .where(and(eq(medicationTrackersTable.residentId, updated.id), gte(medicationTrackersTable.orderedAt, cutoff))),
  ]);

  res.json(
    ListResidentsResponseItem.parse({
      ...updated,
      allergies: updated.allergies ?? [],
      infectionFlags: updated.infectionFlags ?? [],
      recentFallCount: Number(fallCounts[0]?.cnt ?? 0),
      recentMedChangeCount: Number(medCounts[0]?.cnt ?? 0),
    }),
  );
});

router.patch("/residents/:residentId/favorite", async (req, res): Promise<void> => {
  const params = ToggleFavoriteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = ToggleFavoriteBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [updated] = await db
    .update(residentsTable)
    .set({ isFavorited: body.data.isFavorited })
    .where(eq(residentsTable.id, params.data.residentId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Resident not found" });
    return;
  }

  req.log.info({ residentId: updated.id, isFavorited: updated.isFavorited }, "Favorite toggled");

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 60);
  const [fallCounts, medCounts] = await Promise.all([
    db
      .select({ cnt: count() })
      .from(fallEventsTable)
      .where(and(eq(fallEventsTable.residentId, updated.id), gte(fallEventsTable.createdAt, cutoff))),
    db
      .select({ cnt: count() })
      .from(medicationTrackersTable)
      .where(and(eq(medicationTrackersTable.residentId, updated.id), gte(medicationTrackersTable.orderedAt, cutoff))),
  ]);

  res.json(
    ListResidentsResponseItem.parse({
      ...updated,
      allergies: updated.allergies ?? [],
      infectionFlags: updated.infectionFlags ?? [],
      recentFallCount: Number(fallCounts[0]?.cnt ?? 0),
      recentMedChangeCount: Number(medCounts[0]?.cnt ?? 0),
    }),
  );
});

export default router;
