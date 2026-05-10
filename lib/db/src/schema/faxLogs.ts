import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { residentsTable } from "./residents";

export const faxLogsTable = pgTable("fax_logs", {
  id: serial("id").primaryKey(),
  residentId: integer("resident_id").notNull().references(() => residentsTable.id),
  destinationLabel: text("destination_label").notNull(),
  faxNumber: text("fax_number").notNull(),
  noteContent: text("note_content").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").notNull().default("Sent (Mock)"),
});

export const insertFaxLogSchema = createInsertSchema(faxLogsTable).omit({ id: true, timestamp: true, status: true });
export type InsertFaxLog = z.infer<typeof insertFaxLogSchema>;
export type FaxLog = typeof faxLogsTable.$inferSelect;
