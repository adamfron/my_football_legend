export const calendarDateString = (date: Date) => date.toISOString().slice(0, 10);
export const utcCalendarDate = (value: string) => new Date(`${value}T12:00:00Z`);
export const shiftCalendarMonth = (month: string, delta: number) => {
  const date = utcCalendarDate(`${month}-01`);
  date.setUTCMonth(date.getUTCMonth() + delta);
  return calendarDateString(date).slice(0, 7);
};
export const calendarDays = (month: string) => {
  const date = utcCalendarDate(`${month}-01`),
    offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(1 - offset);
  return Array.from({ length: 42 }, () => {
    const value = calendarDateString(date);
    date.setUTCDate(date.getUTCDate() + 1);
    return value;
  });
};
