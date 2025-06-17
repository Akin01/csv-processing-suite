import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    let fetchUrl: string;

    // Handle local URLs (start with /)
    if (url.startsWith('/')) {
      const baseUrl = new URL(request.url).origin;
      fetchUrl = `${baseUrl}${url}`;
    } else {
      // Validate external URL
      try {
        new URL(url);
        fetchUrl = url;
      } catch {
        return NextResponse.json(
          { error: 'Invalid URL provided' },
          { status: 400 }
        );
      }
    }

    // Fetch the gzipped CSV file
    const response = await fetch(fetchUrl, {
      headers: {
        'Accept-Encoding': 'gzip',
        'User-Agent': 'CSV-Processor/1.0',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `HTTP error! status: ${response.status}` },
        { status: response.status }
      );
    }

    const contentType = response.headers.get('content-type') || '';
    const contentLength = response.headers.get('content-length');

    // Stream the response back to the client
    if (!response.body) {
      return NextResponse.json(
        { error: 'No response body' },
        { status: 500 }
      );
    }

    return new NextResponse(response.body, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': contentLength || '',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
