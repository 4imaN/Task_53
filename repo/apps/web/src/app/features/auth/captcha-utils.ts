export function svgToDataUrl(svgMarkup: string): string {
  const trimmed = svgMarkup.trim();
  if (!trimmed) {
    return '';
  }

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(trimmed)}`;
}
