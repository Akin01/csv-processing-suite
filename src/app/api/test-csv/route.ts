import { NextRequest, NextResponse } from 'next/server';
import { gzip } from 'zlib';
import { promisify } from 'util';
import { generateTestCsvData } from '@/lib/data/test-data';

const gzipAsync = promisify(gzip);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rowsParam = searchParams.get('rows');
    const rows = rowsParam ? parseInt(rowsParam, 10) : 1000;

    // Limit rows to prevent excessive memory usage and processing time
    const limitedRows = Math.min(Math.max(rows, 10), 5000); // Max 5k rows for safety

    if (limitedRows !== rows) {
      console.warn(`Requested ${rows} rows, limited to ${limitedRows} for performance`);
    }

    // Generate test CSV data
    const csvData = generateTestCsvData(limitedRows);
    
    // Compress the CSV data
    const compressedData = await gzipAsync(csvData);

    return new NextResponse(compressedData, {
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Encoding': 'gzip',
        'Content-Disposition': `attachment; filename="test-data-${limitedRows}-rows.csv.gz"`,
        'Content-Length': compressedData.length.toString(),
        'Cache-Control': 'no-cache',
      },
    });

  } catch (error) {
    console.error('Test CSV generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate test CSV' },
      { status: 500 }
    );
  }
}
