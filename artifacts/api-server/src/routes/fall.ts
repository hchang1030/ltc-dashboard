import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { fallEventsTable } from "@workspace/db";
import { CreateFallEventBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/fall-events", async (req, res): Promise<void> => {
  const parsed = CreateFallEventBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid fall event input");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [row] = await db.insert(fallEventsTable).values(parsed.data).returning();
  req.log.info({ id: row.id, residentId: row.residentId, apparentInjury: row.apparentInjury }, "Fall event recorded");
  res.status(201).json(row);
});

export default router;
