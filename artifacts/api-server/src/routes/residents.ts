import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { residentsTable } from "@workspace/db";
import { ListResidentsResponse, ToggleFavoriteBody, ToggleFavoriteParams } from "@workspace/api-zod";
import { ListResidentsResponseItem } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/residents", async (req, res): Promise<void> => {
  const residents = await db
    .select()
    .from(residentsTable)
    .orderBy(residentsTable.room);
  res.json(ListResidentsResponse.parse(residents));
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
  res.json(ListResidentsResponseItem.parse(updated));
});

export default router;
