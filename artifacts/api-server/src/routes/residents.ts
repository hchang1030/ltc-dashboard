import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { residentsTable } from "@workspace/db";
import { ListResidentsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/residents", async (req, res): Promise<void> => {
  const residents = await db.select().from(residentsTable).orderBy(residentsTable.room);
  res.json(ListResidentsResponse.parse(residents));
});

export default router;
