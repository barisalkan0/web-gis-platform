import { PoiSmoothCheck, PoiTimeField } from './PoiScheduleEditor';

function todayValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

const MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

function readDateParts(value) {
  const [year, month, day] = String(value || todayValue()).split('-').map(Number);
  return {
    year: Number.isFinite(year) ? year : new Date().getFullYear(),
    month: Number.isFinite(month) ? month : 1,
    day: Number.isFinite(day) ? day : 1,
  };
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function toDateValue(year, month, day) {
  const safeDay = Math.min(day, daysInMonth(year, month));
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

function PoiScheduleExceptionEditor({ value = [], onChange }) {
  const rows = Array.isArray(value) ? value : [];

  function update(index, patch) {
    onChange(rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  }

  function addException() {
    onChange([...rows, {
      date: todayValue(),
      repeatsAnnually: false,
      isOpen: false,
      is24Hours: false,
      startTime: '09:00',
      endTime: '18:00',
      note: '',
    }]);
  }

  return (
    <details className="poi-exception-editor">
      <summary>
        <span><strong>Özel günler ve tatiller</strong><small>Haftalık programı seçilen tarihte geçersiz kılar</small></span>
        <span className="poi-exception-count">{rows.length}</span>
      </summary>
      <div className="poi-exception-body">
        {rows.map((row, index) => (
          <div className="poi-exception-card" key={`${row.date}-${row.repeatsAnnually}-${index}`}>
            <div className="poi-exception-date-row">
              {row.repeatsAnnually ? (() => {
                const date = readDateParts(row.date);
                return (
                  <div className="poi-exception-month-day" aria-label={`${index + 1}. yıllık özel gün tarihi`}>
                    <select
                      value={date.month}
                      aria-label={`${index + 1}. özel gün ayı`}
                      onChange={(event) => update(index, { date: toDateValue(2000, Number(event.target.value), date.day) })}
                    >
                      {MONTHS.map((month, monthIndex) => <option value={monthIndex + 1} key={month}>{month}</option>)}
                    </select>
                    <select
                      value={date.day}
                      aria-label={`${index + 1}. özel gün günü`}
                      onChange={(event) => update(index, { date: toDateValue(2000, date.month, Number(event.target.value)) })}
                    >
                      {Array.from({ length: daysInMonth(2000, date.month) }, (_, dayIndex) => (
                        <option value={dayIndex + 1} key={dayIndex + 1}>{dayIndex + 1}</option>
                      ))}
                    </select>
                  </div>
                );
              })() : (
                <input type="date" value={row.date || ''} aria-label={`${index + 1}. özel gün tarihi`} onChange={(event) => update(index, { date: event.target.value })} />
              )}
              <button type="button" className="poi-exception-remove" onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))} aria-label={`${index + 1}. özel günü kaldır`}>Kaldır</button>
            </div>
            <div className="poi-exception-options">
              <PoiSmoothCheck
                checked={!!row.repeatsAnnually}
                onChange={(repeatsAnnually) => {
                  const date = readDateParts(row.date);
                  update(index, {
                    repeatsAnnually,
                    date: toDateValue(repeatsAnnually ? 2000 : new Date().getFullYear(), date.month, date.day),
                  });
                }}
                ariaLabel="Her yıl tekrarla"
              >Her yıl tekrarla</PoiSmoothCheck>
              <PoiSmoothCheck checked={!!row.isOpen} onChange={(isOpen) => update(index, { isOpen })} ariaLabel="Özel günde açık">Açık</PoiSmoothCheck>
              <PoiSmoothCheck checked={!!row.is24Hours} disabled={!row.isOpen} onChange={(is24Hours) => update(index, { is24Hours })} ariaLabel="Özel günde 24 saat açık">24 saat</PoiSmoothCheck>
            </div>
            {row.isOpen && !row.is24Hours && (
              <div className="poi-exception-hours">
                <PoiTimeField value={row.startTime || '09:00'} onChange={(startTime) => update(index, { startTime })} ariaLabel="Özel gün açılış" />
                <span>–</span>
                <PoiTimeField value={row.endTime || '18:00'} onChange={(endTime) => update(index, { endTime })} ariaLabel="Özel gün kapanış" />
              </div>
            )}
            <input className="poi-exception-note" maxLength={200} value={row.note || ''} onChange={(event) => update(index, { note: event.target.value })} placeholder="Örn. Yılbaşı, bakım günü…" aria-label="Özel gün açıklaması" />
          </div>
        ))}
        {rows.length === 0 && <p>Henüz özel gün tanımlanmadı.</p>}
        <button type="button" className="poi-exception-add" onClick={addException}>+ Özel gün ekle</button>
      </div>
    </details>
  );
}

export default PoiScheduleExceptionEditor;
