import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { residentsTable } from "./residents";

export const communicationBinderTable = pgTable("communication_binder", {
  id: serial("id").primaryKey(),
  residentId: integer("resident_id").notNull().references(() => residentsTable.id),
  messageText: text("message_text").notNull(),
  status: text("status").notNull().default("Active"), // "Active" | "Resolved"
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  resolvedTimestamp: timestamp("resolved_timestamp", { withTimezone: true }),
});

export const insertCommunicationBinderSchema = createInsertSchema(communicationBinderTable).omit({
  id: true,
  timestamp: true,
  resolvedTimestamp: true,
});
export type InsertCommunicationBinder = z.infer<typeof insertCommunicationBinderSchema>;
export type CommunicationBinder = typeof communicationBinderTable.$inferSelect;
