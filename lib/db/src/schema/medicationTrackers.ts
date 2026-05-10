import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { residentsTable } from "./residents";

export const medicationTrackersTable = pgTable("medication_trackers", {
  id: serial("id").primaryKey(),
  residentId: integer("resident_id").notNull().references(() => residentsTable.id),
  medicationName: text("medication_name").notNull(),
  dosageInstructions: text("dosage_instructions"),
  status: text("status").notNull().default("Ordered"),
  orderedAt: timestamp("ordered_at", { withTimezone: true }).notNull().defaultNow(),
  startDate: timestamp("start_date", { withTimezone: true }),
  reviewDueDate: timestamp("review_due_date", { withTimezone: true }),
  confirmedBy: text("confirmed_by"),
  notes: text("notes"),
});

export const insertMedicationTrackerSchema = createInsertSchema(medicationTrackersTable).omit({
  id: true,
  orderedAt: true,
  startDate: true,
  reviewDueDate: true,
  confirmedBy: true,
  status: true,
});
export type InsertMedicationTracker = z.infer<typeof insertMedicationTrackerSchema>;
export type MedicationTracker = typeof medicationTrackersTable.$inferSelect;
