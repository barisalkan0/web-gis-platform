export const POI_DAYS = [
  { dayOfWeek: 1, short: 'Pzt', label: 'Pazartesi' },
  { dayOfWeek: 2, short: 'Sal', label: 'Salı' },
  { dayOfWeek: 3, short: 'Çar', label: 'Çarşamba' },
  { dayOfWeek: 4, short: 'Per', label: 'Perşembe' },
  { dayOfWeek: 5, short: 'Cum', label: 'Cuma' },
  { dayOfWeek: 6, short: 'Cmt', label: 'Cumartesi' },
  { dayOfWeek: 0, short: 'Paz', label: 'Pazar' },
];

export function createDefaultPoiSchedule(startTime = '09:00', endTime = '18:00') {
  return POI_DAYS.map(({ dayOfWeek }) => ({ dayOfWeek, isOpen: true, is24Hours: false, startTime, endTime }));
}

export function normalizePoiSchedule(schedule) {
  if (!Array.isArray(schedule) || schedule.length !== 7) return createDefaultPoiSchedule();
  const byDay = new Map(schedule.map((row) => [Number(row.dayOfWeek), row]));
  return POI_DAYS.map(({ dayOfWeek }) => {
    const row = byDay.get(dayOfWeek) || {};
    return {
      dayOfWeek,
      isOpen: row.isOpen !== false,
      is24Hours: !!row.is24Hours,
      startTime: row.startTime || '09:00',
      endTime: row.endTime || '18:00',
    };
  });
}

// AdminPage.jsx'ten taşındı (eskiden oraya özeldi) — Kullanıcının kendi isteği: MapPage'deki
// POI bilgi kartında da (bkz. PoiScheduleSummary.jsx) resmi tatil/özel gün istisnalarının
// tarihi AYNI formatta gösterilsin diye TEK yerden paylaşılıyor.
export function formatPoiExceptionDate(item) {
  if (!item?.date) return '—';
  if (!item.repeatsAnnually) return item.date;
  const [, month, day] = item.date.split('-').map(Number);
  if (!month || !day) return item.date;
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(2000, month - 1, day)));
}

function sameScheduleRule(a, b) {
  return a.isOpen === b.isOpen
    && a.is24Hours === b.is24Hours
    && a.startTime === b.startTime
    && a.endTime === b.endTime;
}

export function groupPoiSchedule(schedule) {
  if (!Array.isArray(schedule) || schedule.length !== 7) return [];
  const rows = normalizePoiSchedule(schedule);
  const groups = [];
  rows.forEach((row, index) => {
    const day = POI_DAYS[index];
    const previous = groups[groups.length - 1];
    if (previous && sameScheduleRule(previous.rule, row)) {
      previous.end = day.short;
      return;
    }
    groups.push({ start: day.short, end: day.short, rule: row });
  });
  // Kullanıcının kendi isteği: "her gün açık ve aynı saat olan yerlerde... Her Gün 09:00 –
  // 18:00 gibi yazsın." — 7 gün de aynı kurala uyunca (tek grup, Pzt'den Paz'a) "Pzt–Paz"
  // yerine "Her Gün" daha okunaklı; bu ÖZEL durumda saat aralığında da (kullanıcının
  // yazdığı örnekle birebir) boşluklu bir "–" kullanıyoruz.
  const isEveryDay = groups.length === 1;
  return groups.map((group) => ({
    label: isEveryDay ? 'Her Gün' : group.start === group.end ? group.start : `${group.start}–${group.end}`,
    value: !group.rule.isOpen
      ? 'Kapalı'
      : group.rule.is24Hours
        ? '24 saat açık'
        : isEveryDay
          ? `${group.rule.startTime} – ${group.rule.endTime}`
          : `${group.rule.startTime}–${group.rule.endTime}`,
    kind: !group.rule.isOpen ? 'closed' : group.rule.is24Hours ? 'always' : 'hours',
    overnight: group.rule.isOpen && !group.rule.is24Hours && group.rule.startTime > group.rule.endTime,
  }));
}
