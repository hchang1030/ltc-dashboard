import { pgTable, serial, integer, text, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { residentsTable } from "./residents";

export const vitalEventsTable = pgTable("vital_events", {
  id: serial("id").primaryKey(),
  residentId: integer("resident_id").notNull().references(() => residentsTable.id),
  staffId: text("staff_id"),
  temp: real("temp"),
  bpSys: integer("bp_sys"),
  bpDia: integer("bp_dia"),
  hr: integer("hr"),
  o2: real("o2"),
  weight: real("weight"),
  isAbnormalFlag: boolean("is_abnormal_flag").notNull().default(false),
  clinicalNote: text("clinical_note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVitalEventSchema = createInsertSchema(vitalEventsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertVitalEvent = z.infer<typeof insertVitalEventSchema>;
export type VitalEvent = typeof vitalEventsTable.$inferSelect;
