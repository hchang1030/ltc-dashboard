import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { behaviorEventsTable } from "@workspace/db";
import { CreateBehaviorEventBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/behavior-events", async (req, res): Promise<void> => {
  const parsed = CreateBehaviorEventBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid behavior event input");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [row] = await db.insert(behaviorEventsTable).values(parsed.data).returning();
  req.log.info({ id: row.id, residentId: row.residentId, type: row.type }, "Behavior event recorded");
  res.status(201).json(row);
});

export default router;
