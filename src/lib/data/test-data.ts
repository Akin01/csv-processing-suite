/**
 * Generates a simple CSV string with test data.
 * @param rowCount The number of data rows to generate (excluding header).
 * @returns A string representing the CSV data.
 */
export function generateTestCsvData(rowCount: number): string {
  const headers = ["ID", "Name", "Email", "Value", "Date"];
  const lines: string[] = [headers.join(",")];

  for (let i = 1; i <= rowCount; i++) {
    const id = i;
    const name = `User ${i}`;
    const email = `user${i}@example.com`;
    const value = (Math.random() * 1000).toFixed(2);
    const date = new Date(Date.now() - Math.floor(Math.random() * 1e10)).toISOString().split('T')[0];
    lines.push([id, name, email, value, date].join(","));
  }

  return lines.join("\\n");
}
