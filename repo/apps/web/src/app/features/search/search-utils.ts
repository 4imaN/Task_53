export function buildPageWindowLabel(page: number, pageSize: number, total: number): string {
  if (!total) {
    return '0-0 of 0';
  }

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(start + pageSize - 1, total);
  return `${start}-${end} of ${total}`;
}
