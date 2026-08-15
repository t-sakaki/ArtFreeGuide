/** Model chains are configured as a comma separated priority list. */
export function parseModelList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map(model => model.trim())
    .filter(Boolean);
}
