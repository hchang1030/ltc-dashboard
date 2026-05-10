import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { residentsTable } from "./residents";

export const communicationLogsTable = pgTable("communication_logs", {
  id: serial("id").primaryKey(),
  residentId: integer("resident_id").notNull().references(() => residentsTable.id),
  destinationLabel: text("destination_label").notNull(),
  contactValue: text("contact_value").notNull(),
  method: text("method").notNull().default("Fax"),
  noteContent: text("note_content").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").notNull().default("Sent (Mock)"),
});

export const insertCommunicationLogSchema = createInsertSchema(communicationLogsTable).omit({ id: true, timestamp: true, status: true });
export type InsertCommunicationLog = z.infer<typeof insertCommunicationLogSchema>;
export type CommunicationLog = typeof communicationLogsTable.$inferSelect;
