import { pgTable, serial, text, boolean, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const residentsTable = pgTable("residents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  room: text("room").notNull(),
  isFavorited: boolean("is_favorited").notNull().default(false),
  dob: date("dob"),
  phn: text("phn"),
  codeStatus: text("code_status"),
  allergies: text("allergies").array(),
  infectionFlags: text("infection_flags").array(),
  sdmName: text("sdm_name"),
  sdmRelation: text("sdm_relation"),
  sdmPhone: text("sdm_phone"),
});

export const insertResidentSchema = createInsertSchema(residentsTable).omit({ id: true });
export type InsertResident = z.infer<typeof insertResidentSchema>;
export type Resident = typeof residentsTable.$inferSelect;
