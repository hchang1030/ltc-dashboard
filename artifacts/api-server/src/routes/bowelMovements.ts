import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { bowelMovementsTable } from "@workspace/db";
import {
  CreateBowelMovementBody,
  ListBowelMovementsQueryParams,
  ListBowelMovementsResponse,
  ListBowelMovementsResponseItem,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/bowel-movements", async (req, res): Promise<void> => {
  const query = ListBowelMovementsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const rows = query.data.residentId
    ? await db
        .select()
        .from(bowelMovementsTable)
        .where(eq(bowelMovementsTable.residentId, query.data.residentId))
        .orderBy(bowelMovementsTable.createdAt)
    : await db
        .select()
        .from(bowelMovementsTable)
        .orderBy(bowelMovementsTable.createdAt);

  res.json(ListBowelMovementsResponse.parse(rows));
});

router.post("/bowel-movements", async (req, res): Promise<void> => {
  const parsed = CreateBowelMovementBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid bowel movement input");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [row] = await db
    .insert(bowelMovementsTable)
    .values(parsed.data)
    .returning();

  req.log.info({ id: row.id, residentId: row.residentId }, "Bowel movement recorded");
  res.status(201).json(ListBowelMovementsResponseItem.parse(row));
});

export default router;
