// Simple test CSV data generator
export function generateTestCsvData(rows: number = 1000): string {
  const headers = ['id', 'name', 'email', 'age', 'city', 'salary', 'department'];
  
  const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia'];
  const departments = ['Engineering', 'Marketing', 'Sales', 'HR', 'Finance', 'Operations'];
  const firstNames = ['John', 'Jane', 'Mike', 'Sarah', 'David', 'Lisa', 'Chris', 'Amy'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis'];

  let csv = headers.join(',') + '\n';

  for (let i = 1; i <= rows; i++) {
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const name = `${firstName} ${lastName}`;
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@company.com`;
    const age = Math.floor(Math.random() * 40) + 25;
    const city = cities[Math.floor(Math.random() * cities.length)];
    const salary = Math.floor(Math.random() * 100000) + 40000;
    const department = departments[Math.floor(Math.random() * departments.length)];

    csv += `${i},"${name}","${email}",${age},"${city}",${salary},"${department}"\n`;
  }

  return csv;
}
