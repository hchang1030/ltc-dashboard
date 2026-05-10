import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { intakeEventsTable } from "@workspace/db";
import { CreateIntakeEventBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/intake-events", async (req, res): Promise<void> => {
  const parsed = CreateIntakeEventBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid intake event input");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { recordedAt, ...data } = parsed.data;

  const [row] = await db
    .insert(intakeEventsTable)
    .values({ ...data, ...(recordedAt ? { createdAt: new Date(recordedAt) } : {}) })
    .returning();

  req.log.info({ id: row.id, residentId: row.residentId, mealType: row.mealType, mealPercent: row.mealPercent }, "Intake event recorded");
  res.status(201).json(row);
});

export default router;
