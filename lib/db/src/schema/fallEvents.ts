import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { residentsTable } from "./residents";

export const fallEventsTable = pgTable("fall_events", {
  id: serial("id").primaryKey(),
  residentId: integer("resident_id").notNull().references(() => residentsTable.id),
  staffId: text("staff_id"),
  isWitnessed: boolean("is_witnessed").notNull().default(false),
  apparentInjury: boolean("apparent_injury").notNull().default(false),
  neuroVitalsStarted: boolean("neuro_vitals_started").notNull().default(false),
  clinicalNote: text("clinical_note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFallEventSchema = createInsertSchema(fallEventsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertFallEvent = z.infer<typeof insertFallEventSchema>;
export type FallEvent = typeof fallEventsTable.$inferSelect;
