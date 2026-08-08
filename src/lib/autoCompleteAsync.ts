import { autoCompleteFields } from '@/lib/autoComplete';
import { updateArtworkMetadata, addArtworkImage } from '@/lib/db';
import { getCloudflareContext } from '@opennextjs/cloudflare';

/**
 * Triggers background metadata completion without blocking user response.
 * Uses Cloudflare Worker's ctx.waitUntil() when available.
 */
export async function triggerAutoCompleteAsync(
  artworkId: number,
  artworkName: string,
  artistName: string,
  missingFields: string[]
): Promise<void> {
  if (!artworkId || !missingFields || missingFields.length === 0) return;

  const bgPromise = (async () => {
    try {
      console.log(`[AutoCompleteAsync] Starting background completion for artwork ID ${artworkId}:`, missingFields);
      const fillResults = await autoCompleteFields(artworkName, artistName, missingFields);
      
      const dbUpdates: any = {};
      const newAutoFilled: string[] = [];

      fillResults.forEach(item => {
        if (item.found && item.value) {
          if (item.field === 'year') dbUpdates.year = item.value;
          if (item.field === 'location') dbUpdates.location = item.value;
          if (item.field === 'medium') dbUpdates.medium = item.value;
          if (item.field === 'dimensions') dbUpdates.dimensions = item.value;
          if (item.field === 'imageUrl') {
            dbUpdates.imageUrl = item.value;
            addArtworkImage(artworkId, item.value, true).catch(() => {});
          }
          if (!newAutoFilled.includes(item.field)) {
            newAutoFilled.push(item.field);
          }
        }
      });

      if (Object.keys(dbUpdates).length > 0) {
        dbUpdates.autoFilled = newAutoFilled;
        dbUpdates.updated_by = 'auto_completion';
        await updateArtworkMetadata(artworkId, dbUpdates);
        console.log(`[AutoCompleteAsync] Successfully updated artwork ID ${artworkId} in background:`, newAutoFilled);
      } else {
        console.log(`[AutoCompleteAsync] Completed background search for artwork ID ${artworkId}; no new fields found.`);
      }
    } catch (e) {
      // Swallow errors to ensure completion never throws or blocks
      console.error('[AutoCompleteAsync] Background completion failed silently:', e);
    }
  })();

  // Hand off to Cloudflare Worker waitUntil context if running in Worker runtime
  try {
    const cfContext = await getCloudflareContext();
    if (cfContext?.ctx?.waitUntil) {
      cfContext.ctx.waitUntil(bgPromise);
      return;
    }
  } catch {
    // Non-blocking fallback if getCloudflareContext is not active
  }

  // Non-blocking background catch for Node / local environments
  bgPromise.catch(err => {
    console.error('[AutoCompleteAsync] Unhandled background promise error:', err);
  });
}
