import { createServiceClient } from '@/lib/supabase';

export const CORRECTIONS_TABLE = 'pronunciation_corrections';

export type CorrectionStatus = 'pending' | 'approved' | 'rejected';

export interface CorrectionRow {
  id: string;
  original: string;
  reading: string;
  context: string | null;
  status: CorrectionStatus;
  created_at: string;
}

/**
 * Approved readings as a dictionary the client can merge over readings.json.
 * The newest approval for a term wins.
 */
export async function fetchApprovedReadings(): Promise<Record<string, string>> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from(CORRECTIONS_TABLE)
    .select('original, reading')
    .eq('status', 'approved')
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return Object.fromEntries((data ?? []).map(row => [row.original, row.reading]));
}
