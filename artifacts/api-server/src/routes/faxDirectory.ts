import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { faxDirectoryTable } from "@workspace/db";
import {
  ListFaxDirectoryResponse,
  ListFaxDirectoryResponseItem,
  CreateFaxEntryBody,
  UpdateFaxEntryParams,
  UpdateFaxEntryBody,
  UpdateFaxEntryResponse,
  DeleteFaxEntryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/fax-directory", async (req, res): Promise<void> => {
  const entries = await db.select().from(faxDirectoryTable).orderBy(faxDirectoryTable.id);
  res.json(ListFaxDirectoryResponse.parse(entries));
});

router.post("/fax-directory", async (req, res): Promise<void> => {
  const body = CreateFaxEntryBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [entry] = await db.insert(faxDirectoryTable).values(body.data).returning();
  res.status(201).json(ListFaxDirectoryResponseItem.parse(entry));
});

router.patch("/fax-directory/:entryId", async (req, res): Promise<void> => {
  const params = UpdateFaxEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateFaxEntryBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [entry] = await db
    .update(faxDirectoryTable)
    .set(body.data)
    .where(eq(faxDirectoryTable.id, params.data.entryId))
    .returning();
  if (!entry) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }
  req.log.info({ entryId: entry.id }, "Fax directory entry updated");
  res.json(UpdateFaxEntryResponse.parse(entry));
});

router.delete("/fax-directory/:entryId", async (req, res): Promise<void> => {
  const params = DeleteFaxEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(faxDirectoryTable).where(eq(faxDirectoryTable.id, params.data.entryId));
  req.log.info({ entryId: params.data.entryId }, "Fax directory entry deleted");
  res.status(204).send();
});

export default router;
