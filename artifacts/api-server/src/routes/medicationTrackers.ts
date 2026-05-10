import { Router, type IRouter } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { medicationTrackersTable, residentsTable, communicationLogsTable } from "@workspace/db";
import {
  ListMedicationTrackersQueryParams,
  ListMedicationTrackersResponse,
  CreateMedicationTrackerBody,
  ConfirmTaperStartedParams,
  ConfirmTaperStartedBody,
  ConfirmTaperStartedResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const selectTracker = {
  id: medicationTrackersTable.id,
  residentId: medicationTrackersTable.residentId,
  residentName: residentsTable.name,
  residentRoom: residentsTable.room,
  medicationName: medicationTrackersTable.medicationName,
  dosageInstructions: medicationTrackersTable.dosageInstructions,
  status: medicationTrackersTable.status,
  orderedAt: medicationTrackersTable.orderedAt,
  startDate: medicationTrackersTable.startDate,
  reviewDueDate: medicationTrackersTable.reviewDueDate,
  confirmedBy: medicationTrackersTable.confirmedBy,
  notes: medicationTrackersTable.notes,
};

router.get("/medication-trackers", async (req, res): Promise<void> => {
  const query = ListMedicationTrackersQueryParams.parse(req.query);

  const conditions = [];
  if (query.residentId) conditions.push(eq(medicationTrackersTable.residentId, query.residentId));
  if (query.status) conditions.push(eq(medicationTrackersTable.status, query.status));

  const trackers = await db
    .select(selectTracker)
    .from(medicationTrackersTable)
    .innerJoin(residentsTable, eq(medicationTrackersTable.residentId, residentsTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(medicationTrackersTable.orderedAt);

  res.json(ListMedicationTrackersResponse.parse(trackers));
});

router.post("/medication-trackers", async (req, res): Promise<void> => {
  const body = CreateMedicationTrackerBody.parse(req.body);

  const [inserted] = await db
    .insert(medicationTrackersTable)
    .values({
      residentId: body.residentId,
      medicationName: body.medicationName,
      dosageInstructions: body.dosageInstructions ?? null,
      notes: body.notes ?? null,
    })
    .returning({ id: medicationTrackersTable.id });

  const [tracker] = await db
    .select(selectTracker)
    .from(medicationTrackersTable)
    .innerJoin(residentsTable, eq(medicationTrackersTable.residentId, residentsTable.id))
    .where(eq(medicationTrackersTable.id, inserted.id));

  res.status(201).json(ConfirmTaperStartedResponse.parse(tracker));
});

router.patch("/medication-trackers/:trackerId/confirm", async (req, res): Promise<void> => {
  const { trackerId } = ConfirmTaperStartedParams.parse(req.params);
  const { confirmedBy } = ConfirmTaperStartedBody.parse(req.body);

  const now = new Date();
  const reviewDueDate = new Date(now);
  reviewDueDate.setDate(reviewDueDate.getDate() + 90);

  const [updated] = await db
    .update(medicationTrackersTable)
    .set({
      status: "Active Taper",
      startDate: now,
      reviewDueDate,
      confirmedBy,
    })
    .where(eq(medicationTrackersTable.id, trackerId))
    .returning({ id: medicationTrackersTable.id, residentId: medicationTrackersTable.residentId, medicationName: medicationTrackersTable.medicationName });

  if (!updated) {
    res.status(404).json({ error: "Tracker not found" });
    return;
  }

  await db.insert(communicationLogsTable).values({
    residentId: updated.residentId,
    destinationLabel: "Physician — Taper Confirmation",
    contactValue: "internal",
    method: "Internal",
    noteContent: `Taper confirmed by ${confirmedBy}: ${updated.medicationName} — started ${now.toLocaleDateString()}. Review due ${reviewDueDate.toLocaleDateString()}.`,
  });

  const [tracker] = await db
    .select(selectTracker)
    .from(medicationTrackersTable)
    .innerJoin(residentsTable, eq(medicationTrackersTable.residentId, residentsTable.id))
    .where(eq(medicationTrackersTable.id, trackerId));

  res.json(ConfirmTaperStartedResponse.parse(tracker));
});

export default router;
