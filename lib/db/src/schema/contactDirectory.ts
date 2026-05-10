import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const contactDirectoryTable = pgTable("contact_directory", {
  id: serial("id").primaryKey(),
  labelName: text("label_name").notNull(),
  contactValue: text("contact_value").notNull(),
  contactType: text("contact_type").notNull().default("Fax"),
});

export const insertContactDirectorySchema = createInsertSchema(contactDirectoryTable).omit({ id: true });
export type InsertContactDirectory = z.infer<typeof insertContactDirectorySchema>;
export type ContactDirectoryEntry = typeof contactDirectoryTable.$inferSelect;
