import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { contactDirectoryTable } from "@workspace/db";
import {
  ListContactDirectoryResponse,
  ListContactDirectoryResponseItem,
  CreateContactEntryBody,
  UpdateContactEntryParams,
  UpdateContactEntryBody,
  UpdateContactEntryResponse,
  DeleteContactEntryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/contact-directory", async (req, res): Promise<void> => {
  const entries = await db.select().from(contactDirectoryTable).orderBy(contactDirectoryTable.id);
  res.json(ListContactDirectoryResponse.parse(entries));
});

router.post("/contact-directory", async (req, res): Promise<void> => {
  const body = CreateContactEntryBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [entry] = await db.insert(contactDirectoryTable).values(body.data).returning();
  res.status(201).json(ListContactDirectoryResponseItem.parse(entry));
});

router.patch("/contact-directory/:entryId", async (req, res): Promise<void> => {
  const params = UpdateContactEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateContactEntryBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [entry] = await db
    .update(contactDirectoryTable)
    .set(body.data)
    .where(eq(contactDirectoryTable.id, params.data.entryId))
    .returning();
  if (!entry) {
    res.status(404).json({ error: "Entry not found" });
    return;
  }
  req.log.info({ entryId: entry.id }, "Contact directory entry updated");
  res.json(UpdateContactEntryResponse.parse(entry));
});

router.delete("/contact-directory/:entryId", async (req, res): Promise<void> => {
  const params = DeleteContactEntryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await db.delete(contactDirectoryTable).where(eq(contactDirectoryTable.id, params.data.entryId));
  req.log.info({ entryId: params.data.entryId }, "Contact directory entry deleted");
  res.status(204).send();
});

export default router;
