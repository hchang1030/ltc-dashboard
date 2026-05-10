import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { residentsTable } from "./residents";

export const intakeEventsTable = pgTable("intake_events", {
  id: serial("id").primaryKey(),
  residentId: integer("resident_id").notNull().references(() => residentsTable.id),
  staffId: text("staff_id"),
  mealType: text("meal_type"), // Breakfast | Lunch | Dinner | Snack
  mealPercent: integer("meal_percent").notNull(), // 0 | 25 | 50 | 75 | 100
  fluidMl: integer("fluid_ml").notNull().default(0),
  supplementsGiven: boolean("supplements_given").notNull().default(false),
  clinicalNote: text("clinical_note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertIntakeEventSchema = createInsertSchema(intakeEventsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertIntakeEvent = z.infer<typeof insertIntakeEventSchema>;
export type IntakeEvent = typeof intakeEventsTable.$inferSelect;
