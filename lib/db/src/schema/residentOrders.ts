import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { residentsTable } from "./residents";

export const residentOrdersTable = pgTable("resident_orders", {
  id: serial("id").primaryKey(),
  residentId: integer("resident_id").notNull().references(() => residentsTable.id),
  orderText: text("order_text").notNull(),
  status: text("status").notNull().default("Pending"),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

export const insertResidentOrderSchema = createInsertSchema(residentOrdersTable).omit({ id: true, timestamp: true, status: true });
export type InsertResidentOrder = z.infer<typeof insertResidentOrderSchema>;
export type ResidentOrder = typeof residentOrdersTable.$inferSelect;
