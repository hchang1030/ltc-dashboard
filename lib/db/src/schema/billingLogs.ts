import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { residentsTable } from "./residents";

export const billingLogsTable = pgTable("billing_logs", {
  id: serial("id").primaryKey(),
  residentId: integer("resident_id").notNull().references(() => residentsTable.id),
  staffId: text("staff_id"),
  billingCode: text("billing_code").notNull(),
  durationMins: integer("duration_mins").notNull().default(0),
  activityType: text("activity_type").notNull(), // Direct | Indirect
  clinicalNote: text("clinical_note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBillingLogSchema = createInsertSchema(billingLogsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertBillingLog = z.infer<typeof insertBillingLogSchema>;
export type BillingLog = typeof billingLogsTable.$inferSelect;
