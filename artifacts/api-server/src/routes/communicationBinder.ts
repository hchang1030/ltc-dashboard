import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { communicationBinderTable, residentsTable } from "@workspace/db";
import { CreateBinderEntryBody, ListBinderEntriesQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

function fmtEntry(
  row: typeof communicationBinderTable.$inferSelect,
  name: string,
  room: string,
) {
  return {
    id: row.id,
    residentId: row.residentId,
    residentName: name,
    residentRoom: room,
    messageText: row.messageText,
    status: row.status,
    timestamp: row.timestamp,
    resolvedTimestamp: row.resolvedTimestamp ?? null,
  };
}

router.get("/communication-binder", async (req, res): Promise<void> => {
  const query = ListBinderEntriesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const rows = await db
    .select({
      id: communicationBinderTable.id,
      residentId: communicationBinderTable.residentId,
      residentName: residentsTable.name,
      residentRoom: residentsTable.room,
      messageText: communicationBinderTable.messageText,
      status: communicationBinderTable.status,
      timestamp: communicationBinderTable.timestamp,
      resolvedTimestamp: communicationBinderTable.resolvedTimestamp,
    })
    .from(communicationBinderTable)
    .innerJoin(residentsTable, eq(communicationBinderTable.residentId, residentsTable.id))
    .where(query.data.status ? eq(communicationBinderTable.status, query.data.status) : undefined)
    .orderBy(desc(communicationBinderTable.timestamp));

  res.json(rows.map((r) => ({
    id: r.id,
    residentId: r.residentId,
    residentName: r.residentName,
    residentRoom: r.residentRoom,
    messageText: r.messageText,
    status: r.status,
    timestamp: r.timestamp,
    resolvedTimestamp: r.resolvedTimestamp ?? null,
  })));
});

router.post("/communication-binder", async (req, res): Promise<void> => {
  const parsed = CreateBinderEntryBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid binder entry input");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [row] = await db
    .insert(communicationBinderTable)
    .values({ residentId: parsed.data.residentId, messageText: parsed.data.messageText, status: "Active" })
    .returning();

  const [resident] = await db
    .select({ name: residentsTable.name, room: residentsTable.room })
    .from(residentsTable)
    .where(eq(residentsTable.id, row.residentId))
    .limit(1);

  req.log.info({ id: row.id, residentId: row.residentId }, "Binder entry created");
  res.status(201).json(fmtEntry(row, resident?.name ?? "", resident?.room ?? ""));
});

router.patch("/communication-binder/:messageId/resolve", async (req, res): Promise<void> => {
  const messageId = parseInt(req.params.messageId, 10);
  if (isNaN(messageId)) { res.status(400).json({ error: "Invalid messageId" }); return; }

  const [row] = await db
    .update(communicationBinderTable)
    .set({ status: "Resolved", resolvedTimestamp: new Date() })
    .where(eq(communicationBinderTable.id, messageId))
    .returning();

  if (!row) { res.status(404).json({ error: "Entry not found" }); return; }

  const [resident] = await db
    .select({ name: residentsTable.name, room: residentsTable.room })
    .from(residentsTable)
    .where(eq(residentsTable.id, row.residentId))
    .limit(1);

  req.log.info({ id: row.id }, "Binder entry resolved");
  res.json(fmtEntry(row, resident?.name ?? "", resident?.room ?? ""));
});

router.patch("/communication-binder/:messageId/undo", async (req, res): Promise<void> => {
  const messageId = parseInt(req.params.messageId, 10);
  if (isNaN(messageId)) { res.status(400).json({ error: "Invalid messageId" }); return; }

  const [row] = await db
    .update(communicationBinderTable)
    .set({ status: "Active", resolvedTimestamp: null })
    .where(eq(communicationBinderTable.id, messageId))
    .returning();

  if (!row) { res.status(404).json({ error: "Entry not found" }); return; }

  const [resident] = await db
    .select({ name: residentsTable.name, room: residentsTable.room })
    .from(residentsTable)
    .where(eq(residentsTable.id, row.residentId))
    .limit(1);

  req.log.info({ id: row.id }, "Binder entry undone");
  res.json(fmtEntry(row, resident?.name ?? "", resident?.room ?? ""));
});

export default router;
