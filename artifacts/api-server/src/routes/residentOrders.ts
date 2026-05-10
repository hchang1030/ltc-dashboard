import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { residentOrdersTable, residentsTable, contactDirectoryTable, communicationLogsTable } from "@workspace/db";
import {
  SignResidentOrderBody,
  ListResidentOrdersQueryParams,
  ListResidentOrdersResponse,
  ListResidentOrdersResponseItem,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/resident-orders", async (req, res): Promise<void> => {
  const body = SignResidentOrderBody.safeParse(req.body);
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

  const faxContacts = await db
    .select()
    .from(contactDirectoryTable)
    .where(eq(contactDirectoryTable.contactType, "Fax"))
    .limit(1);

  const faxContact = faxContacts[0];
  const destinationLabel = faxContact ? faxContact.labelName : "Care Home Fax";
  const contactValue = faxContact ? faxContact.contactValue : "000-000-0000";

  const [order] = await db
    .insert(residentOrdersTable)
    .values({
      residentId: body.data.residentId,
      orderText: body.data.orderText,
      status: "Faxed",
    })
    .returning();

  const orderNote = `PHYSICIAN ORDER — ${resident.name} (Room ${resident.room})\nDate: ${new Date(order.timestamp).toLocaleString()}\n\n${body.data.orderText}`;

  await db.insert(communicationLogsTable).values({
    residentId: body.data.residentId,
    destinationLabel,
    contactValue,
    method: "Fax",
    noteContent: orderNote,
    status: "Sent",
  });

  req.log.info(
    { orderId: order.id, residentId: order.residentId, destination: destinationLabel },
    "Resident order signed and transmitted",
  );

  res.status(201).json(
    ListResidentOrdersResponseItem.parse({
      ...order,
      residentName: resident.name,
      residentRoom: resident.room,
    }),
  );
});

router.get("/resident-orders", async (req, res): Promise<void> => {
  const query = ListResidentOrdersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const baseQuery = db
    .select({
      id: residentOrdersTable.id,
      residentId: residentOrdersTable.residentId,
      residentName: residentsTable.name,
      residentRoom: residentsTable.room,
      orderText: residentOrdersTable.orderText,
      status: residentOrdersTable.status,
      timestamp: residentOrdersTable.timestamp,
    })
    .from(residentOrdersTable)
    .innerJoin(residentsTable, eq(residentOrdersTable.residentId, residentsTable.id))
    .orderBy(desc(residentOrdersTable.timestamp));

  const orders = query.data.residentId
    ? await baseQuery.where(eq(residentOrdersTable.residentId, query.data.residentId))
    : await baseQuery;

  res.json(ListResidentOrdersResponse.parse(orders));
});

export default router;
