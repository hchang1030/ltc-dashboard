import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { vitalEventsTable } from "@workspace/db";
import { CreateVitalEventBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/vital-events", async (req, res): Promise<void> => {
  const parsed = CreateVitalEventBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid vital event input");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [row] = await db.insert(vitalEventsTable).values(parsed.data).returning();
  req.log.info({ id: row.id, residentId: row.residentId, isAbnormalFlag: row.isAbnormalFlag }, "Vital event recorded");
  res.status(201).json(row);
});

export default router;
