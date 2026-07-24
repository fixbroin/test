import { NextResponse } from 'next/server';
import { getGlobalWebSettings } from '@/lib/webServerUtils';

export async function GET() {
  try {
    const data = await getGlobalWebSettings();
    return NextResponse.json(data);
  } catch (error) {
    console.error("API Error in /api/web-settings:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
