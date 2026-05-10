import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const faxDirectoryTable = pgTable("fax_directory", {
  id: serial("id").primaryKey(),
  labelName: text("label_name").notNull(),
  faxNumber: text("fax_number").notNull(),
});

export const insertFaxDirectorySchema = createInsertSchema(faxDirectoryTable).omit({ id: true });
export type InsertFaxDirectory = z.infer<typeof insertFaxDirectorySchema>;
export type FaxDirectoryEntry = typeof faxDirectoryTable.$inferSelect;
