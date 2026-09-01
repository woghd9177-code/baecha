/** Every calendar date from `startIso` to `endIso`, inclusive, as "YYYY-MM-DD" strings. */
export function eachDateInRange(startIso: string, endIso: string): string[] {
  const start = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return [startIso];
  }

  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export function formatDateKorean(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

export function formatDateRangeKorean(startIso: string, endIso: string): string {
  if (startIso === endIso) return formatDateKorean(startIso);
  return `${formatDateKorean(startIso)} ~ ${formatDateKorean(endIso)}`;
}
