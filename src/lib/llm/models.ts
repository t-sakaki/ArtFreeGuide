/** Model chains are configured as a comma separated priority list. */
export function parseModelList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map(model => model.trim())
    .filter(Boolean);
}

/** Provider chains (cross-provider fallback) are a comma separated priority list. */
export function parseProviderList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map(provider => provider.trim().toLowerCase())
    .filter(Boolean);
}
