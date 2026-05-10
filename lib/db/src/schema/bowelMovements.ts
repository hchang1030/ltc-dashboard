import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { residentsTable } from "./residents";

export const bowelMovementsTable = pgTable("bowel_movements", {
  id: serial("id").primaryKey(),
  residentId: integer("resident_id")
    .notNull()
    .references(() => residentsTable.id),
  bristolType: integer("bristol_type").notNull(),
  amount: text("amount").notNull(),
  incontinence: boolean("incontinence").notNull().default(false),
  bloodPresent: boolean("blood_present").notNull().default(false),
  mucusPresent: boolean("mucus_present").notNull().default(false),
  painStraining: boolean("pain_straining").notNull().default(false),
  clinicalNote: text("clinical_note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBowelMovementSchema = createInsertSchema(bowelMovementsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertBowelMovement = z.infer<typeof insertBowelMovementSchema>;
export type BowelMovement = typeof bowelMovementsTable.$inferSelect;
