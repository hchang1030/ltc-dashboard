import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { residentsTable } from "./residents";

export const painEventsTable = pgTable("pain_events", {
  id: serial("id").primaryKey(),
  residentId: integer("resident_id").notNull().references(() => residentsTable.id),
  staffId: text("staff_id"),
  severity: text("severity").notNull(), // None | Mild | Moderate | Severe
  location: text("location").notNull(), // Back | Legs | Chest | Head | Other
  prnGiven: boolean("prn_given").notNull().default(false),
  clinicalNote: text("clinical_note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPainEventSchema = createInsertSchema(painEventsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPainEvent = z.infer<typeof insertPainEventSchema>;
export type PainEvent = typeof painEventsTable.$inferSelect;
