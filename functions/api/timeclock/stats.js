import {
  json, error, requireDb, ensureSettings, dateRangeDays,
  calendarForRange, expectedMinutesForDate, parisDate, ensurePersonalSchema} from "../../_personal.js";

function firstDayOfWeek(date) {
  const d = new Date(`${date}T12:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
  return d.toISOString().slice(0, 10);
}
function addDays(date, n) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function firstDayMonth(date) { return `${date.slice(0, 7)}-01`; }
function lastDayMonth(date) {
  const d = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}
function firstDayYear(date) { return `${date.slice(0,4)}-01-01`; }
function durationMinutes(row) {
  if (!row.ended_at) return Math.max(0, Math.round((Date.now() - new Date(row.started_at)) / 60000));
  return Math.max(0, Math.round((new Date(row.ended_at) - new Date(row.started_at)) / 60000));
}
function paidLeaveBalance(settings, events, today) {
  let n1 = Number(settings.paid_leave_n1 || 0);
  let n = Number(settings.paid_leave_n || 0);
  const start = settings.paid_leave_baseline_date;
  let cursor = new Date(`${start}T12:00:00Z`);
  cursor.setUTCDate(1);
  cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  const end = new Date(`${today}T12:00:00Z`);
  while (cursor <= end) {
    if (cursor.getUTCMonth() === 5) { n1 = n; n = 0; }
    n += 2.5;
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  const leaveDays = new Set();
  for (const event of events.filter(e => e.event_type === "paid_leave")) {
    for (const date of dateRangeDays(
      event.start_date < start ? start : event.start_date,
      event.end_date > today ? today : event.end_date
    )) leaveDays.add(date);
  }
  for (const _ of leaveDays) {
    if (n1 >= 1) n1 -= 1;
    else if (n >= 1) n -= 1;
    else if (n1 > 0) { n1 = 0; }
    else if (n > 0) { n = 0; }
  }
  return { n1, n, leave_days: leaveDays.size };
}

export async function onRequestGet(context) {
  try {
    const db = requireDb(context);
    await ensurePersonalSchema(db);
    const url = new URL(context.request.url);
    const today = url.searchParams.get("date") || parisDate();
    const weekStart = url.searchParams.get("week_start") || firstDayOfWeek(today);
    const weekEnd = addDays(weekStart, 6);
    const yearStart = firstDayYear(today);
    const monthStart = firstDayMonth(today);
    const monthEnd = lastDayMonth(today);
    const settings = await ensureSettings(db);
    const events = await calendarForRange(db, yearStart, today);

    const workRes = await db.prepare("SELECT * FROM work_sessions ORDER BY started_at DESC").all();
    const driveRes = await db.prepare("SELECT * FROM driving_sessions ORDER BY started_at DESC").all();
    const fuelRes = await db.prepare("SELECT * FROM fuel_fillups ORDER BY filled_at DESC").all();
    const declaredRes = await db.prepare("SELECT * FROM declared_hours ORDER BY work_date DESC").all();

    const work = workRes.results || [];
    const driving = driveRes.results || [];
    const fuels = fuelRes.results || [];
    const declarations = declaredRes.results || [];

    const localDate = iso => new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris", year:"numeric", month:"2-digit", day:"2-digit"
    }).format(new Date(iso));

    const actualByDay = {};
    for (const row of work) {
      const date = localDate(row.started_at);
      actualByDay[date] = (actualByDay[date] || 0) + durationMinutes(row);
    }
    const drivingByDay = {};
    const kmByDay = {};
    for (const row of driving) {
      const date = localDate(row.started_at);
      drivingByDay[date] = (drivingByDay[date] || 0) + durationMinutes(row);
      const distance = row.km_end == null ? 0 : Math.max(0, Number(row.km_end) - Number(row.km_start));
      kmByDay[date] = (kmByDay[date] || 0) + distance;
    }

    const period = (start, end) => {
      const dates = dateRangeDays(start, end > today ? today : end);
      return {
        actual: dates.reduce((s,d)=>s+(actualByDay[d]||0),0),
        driving: dates.reduce((s,d)=>s+(drivingByDay[d]||0),0),
        km: dates.reduce((s,d)=>s+(kmByDay[d]||0),0),
        expected: dates.reduce((s,d)=>s+expectedMinutesForDate(d,events),0)
      };
    };

    const baselineYear = String(settings.overtime_baseline_date).slice(0,4);
    const currentYear = today.slice(0,4);
    const overtimeStart = currentYear === baselineYear ? settings.overtime_baseline_date : `${currentYear}-01-01`;
    const initialOvertime = currentYear === baselineYear ? Number(settings.overtime_balance_minutes) : 0;
    const declaredSince = declarations.filter(d => d.work_date >= overtimeStart && d.work_date <= today);
    const expectedSince = dateRangeDays(overtimeStart, today)
      .reduce((s,d)=>s+expectedMinutesForDate(d,events),0);
    const overtime = initialOvertime
      + declaredSince.reduce((s,d)=>s+Number(d.total_minutes||0),0)
      - expectedSince;

    const leave = paidLeaveBalance(settings, events, today);

    const consumption = [];
    const byVehicle = {};
    for (const fill of fuels) {
      (byVehicle[fill.vehicle_registration] ||= []).push(fill);
    }
    for (const [vehicle, rows] of Object.entries(byVehicle)) {
      rows.sort((a,b)=>Number(a.odometer_km)-Number(b.odometer_km));
      let litres = 0, distance = 0;
      for (let i=1;i<rows.length;i++) {
        const delta = Number(rows[i].odometer_km)-Number(rows[i-1].odometer_km);
        if (delta > 0) { distance += delta; litres += Number(rows[i].litres); }
      }
      if (distance > 0) consumption.push({ vehicle, litres, distance, l_per_100km: litres/distance*100 });
    }

    const weekDeclarations = declarations.filter(d => d.work_date >= weekStart && d.work_date <= weekEnd);
    const daily = dateRangeDays(yearStart, today).map(date => ({
      date,
      actual_minutes: actualByDay[date] || 0,
      driving_minutes: drivingByDay[date] || 0,
      km: kmByDay[date] || 0,
      expected_minutes: expectedMinutesForDate(date, events)
    })).filter(r => r.actual_minutes || r.driving_minutes || r.km || declarations.some(d=>d.work_date===r.date));

    return json({
      today,
      week_start: weekStart,
      week_end: weekEnd,
      settings,
      overtime_minutes: overtime,
      paid_leave: leave,
      periods: {
        today: period(today, today),
        week: period(weekStart, weekEnd),
        month: period(monthStart, monthEnd),
        year: period(yearStart, `${today.slice(0,4)}-12-31`)
      },
      week_declarations: weekDeclarations,
      declarations,
      work_sessions: work,
      driving_sessions: driving,
      fuel_fillups: fuels,
      consumption,
      daily,
      distance_totals: {
        today: period(today,today).km,
        week: period(weekStart,weekEnd).km,
        month: period(monthStart,monthEnd).km,
        year: period(yearStart,`${today.slice(0,4)}-12-31`).km,
        all: driving.reduce((s,r)=>s+(r.km_end==null?0:Math.max(0,Number(r.km_end)-Number(r.km_start))),0)
      }
    });
  } catch (exception) {
    return error(exception.message, 500);
  }
}
