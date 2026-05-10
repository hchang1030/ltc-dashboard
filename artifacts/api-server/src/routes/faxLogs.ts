import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { faxLogsTable, residentsTable } from "@workspace/db";
import {
  SendFaxBody,
  ListFaxHistoryParams,
  ListFaxHistoryResponse,
  ListFaxHistoryResponseItem,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/fax", async (req, res): Promise<void> => {
  const body = SendFaxBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [resident] = await db
    .select()
    .from(residentsTable)
    .where(eq(residentsTable.id, body.data.residentId));

  if (!resident) {
    res.status(404).json({ error: "Resident not found" });
    return;
  }

  const [log] = await db
    .insert(faxLogsTable)
    .values({
      residentId: body.data.residentId,
      destinationLabel: body.data.destinationLabel,
      faxNumber: body.data.faxNumber,
      noteContent: body.data.noteContent,
    })
    .returning();

  req.log.info({ logId: log.id, residentId: log.residentId }, "Fax sent (mock)");

  res.status(201).json(
    ListFaxHistoryResponseItem.parse({
      ...log,
      residentName: resident.name,
      residentRoom: resident.room,
    }),
  );
});

router.get("/residents/:residentId/fax-history", async (req, res): Promise<void> => {
  const params = ListFaxHistoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const logs = await db
    .select({
      id: faxLogsTable.id,
      residentId: faxLogsTable.residentId,
      residentName: residentsTable.name,
      residentRoom: residentsTable.room,
      destinationLabel: faxLogsTable.destinationLabel,
      faxNumber: faxLogsTable.faxNumber,
      noteContent: faxLogsTable.noteContent,
      timestamp: faxLogsTable.timestamp,
      status: faxLogsTable.status,
    })
    .from(faxLogsTable)
    .innerJoin(residentsTable, eq(faxLogsTable.residentId, residentsTable.id))
    .where(eq(faxLogsTable.residentId, params.data.residentId))
    .orderBy(desc(faxLogsTable.timestamp));

  res.json(ListFaxHistoryResponse.parse(logs));
});

export default router;
