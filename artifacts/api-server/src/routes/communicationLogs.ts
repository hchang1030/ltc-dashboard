import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { communicationLogsTable, residentsTable } from "@workspace/db";
import {
  SendCommunicationBody,
  ListCommunicationsQueryParams,
  ListCommunicationsResponse,
  ListCommunicationsResponseItem,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/communications", async (req, res): Promise<void> => {
  const body = SendCommunicationBody.safeParse(req.body);
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
    .insert(communicationLogsTable)
    .values({
      residentId: body.data.residentId,
      destinationLabel: body.data.destinationLabel,
      contactValue: body.data.contactValue,
      method: body.data.method,
      noteContent: body.data.noteContent,
    })
    .returning();

  req.log.info({ logId: log.id, residentId: log.residentId, method: log.method }, "Communication sent (mock)");

  res.status(201).json(
    ListCommunicationsResponseItem.parse({
      ...log,
      residentName: resident.name,
      residentRoom: resident.room,
    }),
  );
});

router.get("/communications", async (req, res): Promise<void> => {
  const query = ListCommunicationsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const baseQuery = db
    .select({
      id: communicationLogsTable.id,
      residentId: communicationLogsTable.residentId,
      residentName: residentsTable.name,
      residentRoom: residentsTable.room,
      destinationLabel: communicationLogsTable.destinationLabel,
      contactValue: communicationLogsTable.contactValue,
      method: communicationLogsTable.method,
      noteContent: communicationLogsTable.noteContent,
      timestamp: communicationLogsTable.timestamp,
      status: communicationLogsTable.status,
    })
    .from(communicationLogsTable)
    .innerJoin(residentsTable, eq(communicationLogsTable.residentId, residentsTable.id))
    .orderBy(desc(communicationLogsTable.timestamp));

  const logs = query.data.residentId
    ? await baseQuery.where(eq(communicationLogsTable.residentId, query.data.residentId))
    : await baseQuery;

  res.json(ListCommunicationsResponse.parse(logs));
});

export default router;
