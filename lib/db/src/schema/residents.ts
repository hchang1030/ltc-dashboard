import { pgTable, serial, text, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const residentsTable = pgTable("residents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  room: text("room").notNull(),
  isFavorited: boolean("is_favorited").notNull().default(false),
});

export const insertResidentSchema = createInsertSchema(residentsTable).omit({ id: true });
export type InsertResident = z.infer<typeof insertResidentSchema>;
export type Resident = typeof residentsTable.$inferSelect;
