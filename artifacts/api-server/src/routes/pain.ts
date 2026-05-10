import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { painEventsTable } from "@workspace/db";
import { CreatePainEventBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/pain-events", async (req, res): Promise<void> => {
  const parsed = CreatePainEventBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid pain event input");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { recordedAt, ...data } = parsed.data;

  const [row] = await db
    .insert(painEventsTable)
    .values({ ...data, ...(recordedAt ? { createdAt: new Date(recordedAt) } : {}) })
    .returning();

  req.log.info({ id: row.id, residentId: row.residentId, severity: row.severity }, "Pain event recorded");
  res.status(201).json(row);
});

export default router;
