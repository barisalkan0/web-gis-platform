import { POI_DAYS, normalizePoiSchedule, formatPoiExceptionDate } from '../poiScheduleUtils';

// Kullanıcının kendi isteği: "dümdüz kullanıcı olan birisi... sadece açık kapalı olduğu
// günler aşağı doğru güzel arayüz ile listelensin. bilgi sahibi olsun yeterli. resmi
// tatillerdeki çalışma saatlerini de bilebilmeli." — POI bilgi kartındaki tek satırlık
// gruplu özetin (bkz. groupPoiSchedule, "Pzt–Cum 09:00–18:00 · Cmt–Paz Kapalı") aksine, gün
// gün dikey bir liste + altında (varsa) özel gün/resmi tatil istisnaları. Sadece "Kullanıcı"
// rolü ve "Operatör"ün orta seviye görünümünde kullanılıyor (bkz. MapPage.jsx poi info
// kartı) — Admin ve sahibi olunan POI'lerde hâlâ eski kompakt özet gösteriliyor.
function PoiScheduleSummary({ schedule, scheduleExceptions, legacyText }) {
  const rows = Array.isArray(schedule) && schedule.length === 7 ? normalizePoiSchedule(schedule) : null;

  if (!rows) {
    return <div className="poi-schedule-summary-legacy">{legacyText || 'Mesai saatleri belirtilmemiş.'}</div>;
  }

  return (
    <div className="poi-schedule-summary-view">
      <div className="poi-schedule-summary-days">
        {POI_DAYS.map((day) => {
          const row = rows.find((r) => r.dayOfWeek === day.dayOfWeek);
          const isOpen = !!row?.isOpen;
          return (
            <div className={`poi-schedule-summary-day${isOpen ? ' is-open' : ' is-closed'}`} key={day.dayOfWeek}>
              <span className="poi-schedule-summary-day-dot" aria-hidden="true" />
              <span className="poi-schedule-summary-day-name">{day.label}</span>
              <span className="poi-schedule-summary-day-status">
                {!isOpen ? 'Kapalı' : row.is24Hours ? '24 saat açık' : `${row.startTime} – ${row.endTime}`}
              </span>
            </div>
          );
        })}
      </div>
      {scheduleExceptions?.length > 0 && (
        <div className="poi-schedule-summary-exceptions">
          <div className="poi-schedule-summary-exceptions-title">Özel Günler / Resmi Tatiller</div>
          {scheduleExceptions.map((item) => (
            <div className="poi-schedule-summary-exception-row" key={`${item.date}-${item.repeatsAnnually}`}>
              <span>{formatPoiExceptionDate(item)}{item.repeatsAnnually ? ' (her yıl)' : ''}</span>
              <span>{item.isOpen ? (item.is24Hours ? '24 saat açık' : `${item.startTime} – ${item.endTime}`) : 'Kapalı'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default PoiScheduleSummary;
