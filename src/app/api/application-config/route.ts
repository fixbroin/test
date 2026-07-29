import { NextResponse } from 'next/server';
import { getGlobalAppSettings } from '@/lib/webServerUtils';

export async function GET() {
  try {
    const data = await getGlobalAppSettings();
    return NextResponse.json(data);
  } catch (error) {
    console.error("API Error in /api/application-config:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
