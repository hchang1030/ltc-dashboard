import { pgTable, serial, text, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const orderTemplatesTable = pgTable("order_templates", {
  id: serial("id").primaryKey(),
  category: text("category").notNull().default("Order Set"),
  title: text("title").notNull(),
  contentJson: text("content_json").notNull(),
  isFavorited: boolean("is_favorited").notNull().default(false),
});

export const insertOrderTemplateSchema = createInsertSchema(orderTemplatesTable).omit({ id: true });
export type InsertOrderTemplate = z.infer<typeof insertOrderTemplateSchema>;
export type OrderTemplate = typeof orderTemplatesTable.$inferSelect;
