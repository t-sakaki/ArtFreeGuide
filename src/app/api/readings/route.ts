import { NextResponse } from 'next/server';
import { fetchApprovedReadings } from '@/lib/readingCorrections';

/**
 * Approved reading corrections, layered over src/data/readings.json by the
 * client on mount. Errors return an empty dictionary so narration falls back
 * to the bundled readings instead of failing.
 */
export async function GET() {
  try {
    return NextResponse.json({ readings: await fetchApprovedReadings() });
  } catch (error: any) {
    console.error('Readings API Error:', error);
    return NextResponse.json({ readings: {} });
  }
}
