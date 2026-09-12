import { useState } from 'react';
import { normalizePoiSchedule, POI_DAYS } from '../poiScheduleUtils';

function sameRule(a, b) {
  return a.isOpen === b.isOpen
    && a.is24Hours === b.is24Hours
    && a.startTime === b.startTime
    && a.endTime === b.endTime;
}

function clampNumber(value, max) {
  const parsed = Number.parseInt(String(value || '0').replace(/\D/g, ''), 10);
  return String(Math.min(max, Math.max(0, Number.isFinite(parsed) ? parsed : 0))).padStart(2, '0');
}

export function PoiSmoothCheck({ checked, disabled = false, onChange, children, ariaLabel }) {
  return (
    <label className={`poi-smooth-check${disabled ? ' is-disabled' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="poi-smooth-check-track" aria-hidden="true"><span /></span>
      <span className="poi-smooth-check-label">{children}</span>
    </label>
  );
}

export function PoiTimeField({ value, onChange, ariaLabel, disabled }) {
  const [hour = '00', minute = '00'] = String(value || '00:00').split(':');

  function commit(nextHour, nextMinute) {
    onChange(`${clampNumber(nextHour, 23)}:${clampNumber(nextMinute, 59)}`);
  }

  function adjustPart(part, delta) {
    const currentHour = Number.parseInt(hour, 10) || 0;
    const currentMinute = Number.parseInt(minute, 10) || 0;
    if (part === 'hour') {
      commit(Math.min(23, Math.max(0, currentHour + delta)), currentMinute);
      return;
    }
    commit(currentHour, Math.min(59, Math.max(0, currentMinute + delta)));
  }

  function handleArrow(event, part) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    adjustPart(part, event.key === 'ArrowUp' ? 1 : -1);
  }

  return (
    <div className={`poi-time-field${disabled ? ' is-disabled' : ''}`} aria-label={ariaLabel}>
      <div className="poi-time-segment">
        <input
          inputMode="numeric"
          maxLength={2}
          value={hour}
          disabled={disabled}
          aria-label={`${ariaLabel} saat`}
          onKeyDown={(event) => handleArrow(event, 'hour')}
          onChange={(event) => {
            const next = event.target.value.replace(/\D/g, '').slice(0, 2);
            onChange(`${next}:${minute}`);
            if (next.length === 2) commit(next, minute);
          }}
          onBlur={() => commit(hour, minute)}
        />
        <span className="poi-time-part-stepper">
          <button type="button" disabled={disabled} aria-label={`${ariaLabel} saati artır`} onClick={() => adjustPart('hour', 1)}>▲</button>
          <button type="button" disabled={disabled} aria-label={`${ariaLabel} saati azalt`} onClick={() => adjustPart('hour', -1)}>▼</button>
        </span>
      </div>
      <span className="poi-time-colon" aria-hidden="true">:</span>
      <div className="poi-time-segment">
        <input
          inputMode="numeric"
          maxLength={2}
          value={minute}
          disabled={disabled}
          aria-label={`${ariaLabel} dakika`}
          onKeyDown={(event) => handleArrow(event, 'minute')}
          onChange={(event) => {
            const next = event.target.value.replace(/\D/g, '').slice(0, 2);
            onChange(`${hour}:${next}`);
            if (next.length === 2) commit(hour, next);
          }}
          onBlur={() => commit(hour, minute)}
        />
        <span className="poi-time-part-stepper">
          <button type="button" disabled={disabled} aria-label={`${ariaLabel} dakikayı artır`} onClick={() => adjustPart('minute', 1)}>▲</button>
          <button type="button" disabled={disabled} aria-label={`${ariaLabel} dakikayı azalt`} onClick={() => adjustPart('minute', -1)}>▼</button>
        </span>
      </div>
    </div>
  );
}

function ScheduleControls({ row, onChange, prefix }) {
  return (
    <div className="poi-schedule-controls">
      <PoiSmoothCheck checked={row.isOpen} onChange={(isOpen) => onChange({ ...row, isOpen })} ariaLabel={`${prefix} açık`}>Açık</PoiSmoothCheck>
      <PoiSmoothCheck checked={row.is24Hours} disabled={!row.isOpen} onChange={(is24Hours) => onChange({ ...row, is24Hours })} ariaLabel={`${prefix} 24 saat açık`}>24 saat</PoiSmoothCheck>
      <PoiTimeField
        value={row.startTime}
        disabled={!row.isOpen || row.is24Hours}
        ariaLabel={`${prefix} açılış`}
        onChange={(startTime) => onChange({ ...row, startTime })}
      />
      <span className="poi-schedule-separator">–</span>
      <PoiTimeField
        value={row.endTime}
        disabled={!row.isOpen || row.is24Hours}
        ariaLabel={`${prefix} kapanış`}
        onChange={(endTime) => onChange({ ...row, endTime })}
      />
      {row.isOpen && !row.is24Hours && row.startTime > row.endTime && <small className="poi-schedule-overnight">Ertesi gün</small>}
      {/* Kullanıcının kendi isteği: "Kapalı yazısı da olsun, tüm günler kısmını kapatınca tüm
          günlerde kapalı olacağını anlayalım." — isOpen kapalıyken saat alanları zaten
          disabled görünüyordu ama hiçbir metin yoktu, "neden boş bunlar" belirsizdi. */}
      {!row.isOpen && <small className="poi-schedule-closed">Kapalı</small>}
    </div>
  );
}

function PoiScheduleEditor({ value, onChange, legacyText }) {
  const rows = normalizePoiSchedule(value);
  const [sameHours, setSameHours] = useState(() => rows.every((row) => sameRule(row, rows[0])));

  function replaceDay(dayOfWeek, nextRow) {
    onChange(rows.map((row) => row.dayOfWeek === dayOfWeek ? { ...nextRow, dayOfWeek } : row));
  }

  function replaceAll(nextRow) {
    onChange(rows.map((row) => ({ ...nextRow, dayOfWeek: row.dayOfWeek })));
  }

  return (
    <div className="poi-schedule-editor">
      {legacyText && (
        <div className="poi-schedule-legacy"><strong>Eski kayıt:</strong> {legacyText}. Kaydedildiğinde yapılandırılmış programa dönüşür.</div>
      )}
      <div className="poi-schedule-header">
        <PoiSmoothCheck
          checked={sameHours}
          ariaLabel="Her gün aynı saatleri kullan"
          onChange={(checked) => {
            setSameHours(checked);
            replaceAll(rows[0]);
          }}
        >Her gün aynı saatler</PoiSmoothCheck>
        <small>{sameHours ? 'Tek program tüm günlere uygulanır' : 'Her günü ayrı düzenle'}</small>
      </div>
      {sameHours ? (
        <div className="poi-schedule-day poi-schedule-day-all">
          <strong>Tüm günler</strong>
          <ScheduleControls row={rows[0]} onChange={replaceAll} prefix="Her gün" />
        </div>
      ) : (
        <div className="poi-schedule-days">
          {POI_DAYS.map((day) => {
            const row = rows.find((item) => item.dayOfWeek === day.dayOfWeek);
            return (
              <div className="poi-schedule-day" key={day.dayOfWeek}>
                <strong title={day.label}>{day.short}</strong>
                <ScheduleControls row={row} onChange={(next) => replaceDay(day.dayOfWeek, next)} prefix={day.label} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default PoiScheduleEditor;
