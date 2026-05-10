import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { residentsTable } from "./residents";

export const behaviorEventsTable = pgTable("behavior_events", {
  id: serial("id").primaryKey(),
  residentId: integer("resident_id").notNull().references(() => residentsTable.id),
  staffId: text("staff_id"),
  type: text("type").notNull(), // Agitation | Physical | Verbal | Wandering | Refusing Care
  intensity: text("intensity").notNull(), // Low | High
  durationMins: integer("duration_mins"),
  clinicalNote: text("clinical_note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBehaviorEventSchema = createInsertSchema(behaviorEventsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertBehaviorEvent = z.infer<typeof insertBehaviorEventSchema>;
export type BehaviorEvent = typeof behaviorEventsTable.$inferSelect;
