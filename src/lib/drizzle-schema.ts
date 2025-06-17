import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

// Base table for storing CSV metadata
export const csvMetadata = pgTable("csv_metadata", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  tableName: text("table_name").notNull().unique(),
  originalUrl: text("original_url").notNull(),
  fileName: text("file_name").notNull(),
  totalRows: integer("total_rows").notNull().default(0),
  columnCount: integer("column_count").notNull().default(0),
  processingTime: integer("processing_time_ms"),
  fileSize: integer("file_size_bytes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Type for CSV metadata
export type CsvMetadata = typeof csvMetadata.$inferSelect;
export type NewCsvMetadata = typeof csvMetadata.$inferInsert;

// Dynamic table creation function for CSV tables
export function createCsvTableSchema(tableName: string, columns: { name: string; type: string }[]) {
  // This is used to generate SQL for creating tables dynamically
  const columnDefs = columns.map(col => {
    switch (col.type.toLowerCase()) {
      case 'number':
      case 'numeric':
        return `"${col.name}" NUMERIC`;
      case 'integer':
      case 'int':
        return `"${col.name}" INTEGER`;
      case 'boolean':
      case 'bool':
        return `"${col.name}" BOOLEAN`;
      case 'date':
        return `"${col.name}" DATE`;
      case 'timestamp':
        return `"${col.name}" TIMESTAMP`;
      default:
        return `"${col.name}" TEXT`;
    }
  }).join(', ');
  
  return `CREATE TABLE IF NOT EXISTS "${tableName}" (${columnDefs})`;
}

// SQL helper for inserting data with placeholders
export function createInsertSql(tableName: string, columnNames: string[]) {
  const columns = columnNames.map(name => `"${name}"`).join(', ');
  const placeholders = columnNames.map((_, i) => `$${i + 1}`).join(', ');
  return `INSERT INTO "${tableName}" (${columns}) VALUES (${placeholders})`;
}
