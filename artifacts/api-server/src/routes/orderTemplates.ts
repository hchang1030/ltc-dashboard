import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { orderTemplatesTable } from "@workspace/db";
import {
  ListOrderTemplatesQueryParams,
  ListOrderTemplatesResponse,
  CreateOrderTemplateBody,
  UpdateOrderTemplateParams,
  UpdateOrderTemplateBody,
  UpdateOrderTemplateResponse,
  DeleteOrderTemplateParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/order-templates", async (req, res): Promise<void> => {
  const query = ListOrderTemplatesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const baseQuery = db.select().from(orderTemplatesTable);

  const rows =
    query.data.favoritedOnly === true
      ? await baseQuery.where(eq(orderTemplatesTable.isFavorited, true))
      : await baseQuery;

  res.json(ListOrderTemplatesResponse.parse(rows));
});

router.post("/order-templates", async (req, res): Promise<void> => {
  const body = CreateOrderTemplateBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [template] = await db
    .insert(orderTemplatesTable)
    .values({
      category: body.data.category,
      title: body.data.title,
      contentJson: body.data.contentJson,
      isFavorited: body.data.isFavorited ?? false,
    })
    .returning();

  req.log.info({ templateId: template.id, title: template.title }, "Order template created");
  res.status(201).json(template);
});

router.patch("/order-templates/:templateId", async (req, res): Promise<void> => {
  const params = UpdateOrderTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateOrderTemplateBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [template] = await db
    .update(orderTemplatesTable)
    .set({
      category: body.data.category,
      title: body.data.title,
      contentJson: body.data.contentJson,
      isFavorited: body.data.isFavorited ?? false,
    })
    .where(eq(orderTemplatesTable.id, params.data.templateId))
    .returning();

  if (!template) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  req.log.info({ templateId: template.id }, "Order template updated");
  res.json(UpdateOrderTemplateResponse.parse(template));
});

router.delete("/order-templates/:templateId", async (req, res): Promise<void> => {
  const params = DeleteOrderTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db
    .delete(orderTemplatesTable)
    .where(eq(orderTemplatesTable.id, params.data.templateId));

  req.log.info({ templateId: params.data.templateId }, "Order template deleted");
  res.status(204).send();
});

export default router;
