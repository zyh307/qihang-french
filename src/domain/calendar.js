import { day, addDays } from './learning.js';

export function shiftMonth(month, offset) {
  const [year, number] = month.split('-').map(Number);
  return day(new Date(year, number - 1 + offset, 1, 12)).slice(0, 7);
}
export function monthCells(month, activity = {}, today = day()) {
  const first = `${month}-01`;
  const offset = (new Date(`${first}T12:00:00`).getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => {
    const date = addDays(first, i - offset), record = activity[date];
    return { date, number: Number(date.slice(8)), inMonth: date.startsWith(month), today: date === today, future: date > today, count: record?.words?.length || 0, active: !!(record?.words?.length || record?.attempts) };
  });
}
export function monthSummary(month, activity = {}) {
  const records = Object.entries(activity).filter(([date]) => date.startsWith(`${month}-`)).map(([, record]) => record);
  const words = new Set(records.flatMap(r => r.words || []));
  return { words: words.size, days: records.filter(r => r.words?.length || r.attempts).length, attempts: records.reduce((sum, r) => sum + (r.attempts || 0), 0) };
}
