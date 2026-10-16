"""Next-day 24-hr PSI outlook: NEA's own forecast blended with a bias-corrected
CAMS model run, recent persistence/trend and NEA's weather outlook.

Every signal is optional; the outlook degrades to whatever is available and
reports how confident it is. Fetching is injected so tests can run offline.
"""
import concurrent.futures
import datetime as dt
import html
import json
import re
import urllib.parse

SGT = dt.timezone(dt.timedelta(hours=8))
REGIONS = ['north', 'south', 'east', 'west', 'central']
# Approximate region centres for the gridded model.
COORDS = {'north': (1.418, 103.82), 'south': (1.29, 103.82), 'east': (1.35, 103.94),
          'west': (1.35, 103.70), 'central': (1.35, 103.82)}
CAMS = 'https://air-quality-api.open-meteo.com/v1/air-quality?'
OUTLOOK = 'https://api-open.data.gov.sg/v2/real-time/api/four-day-outlook'
# NEA PSI sub-index for 24-hr mean PM2.5 (µg/m³ ↔ PSI), linear between breakpoints.
PM25_PSI = [(0, 0), (12, 50), (55, 100), (150, 200), (250, 300), (350, 400), (500, 500)]
BANDS = {'good': (0, 50), 'moderate': (51, 100), 'unhealthy': (101, 200),
         'very unhealthy': (201, 300), 'hazardous': (301, 400)}
LOG_DAYS = 14


def psi_from_pm25(pm):
    for (c0, p0), (c1, p1) in zip(PM25_PSI, PM25_PSI[1:]):
        if pm <= c1:
            return p0 + (p1 - p0) * (max(pm, c0) - c0) / (c1 - c0)
    return 500


def band_range(text):
    """'Unhealthy to Low Very Unhealthy' -> (101, 233). None if unrecognised."""
    parts = re.split(r'\s+to\s+', text.strip().lower())
    bounds = []
    for part in parts:
        m = re.fullmatch(r'(?:(low|mid|high)(?:-end of the)?\s+)?(good|moderate|unhealthy|very unhealthy|hazardous)(?: range)?', part.strip())
        if not m:
            return None
        lo, hi = BANDS[m.group(2)]
        third = (hi - lo) / 3
        if m.group(1):
            k = ['low', 'mid', 'high'].index(m.group(1))
            lo, hi = lo + k * third, lo + (k + 1) * third
        bounds.append((lo, hi))
    return round(bounds[0][0]), round(bounds[-1][1])


def page_text(markup):
    text = re.sub(r'<script.*?</script>|<style.*?</style>', ' ', markup, flags=re.S)
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', text)))


def official_forecast(fetch, advisories):
    """Parse the newest NEA 'Haze Situation Update'. They are issued in the evening for the next day."""
    updates = [a for a in advisories if a.get('title', '').lower().startswith('haze situation update')]
    if not updates:
        return None
    latest = max(updates, key=lambda a: a.get('publishedAt') or '')
    text = page_text(fetch(latest['url']))
    m = re.search(r'24-hr PSI Forecast:\s*(.+?)\s+Health Advisory', text)
    rng = band_range(m.group(1)) if m else None
    if not rng:
        raise ValueError('No PSI forecast in NEA update')
    date = re.search(r'PSI forecast for (\d{1,2} \w{3,9} \d{4})', text)
    if date:
        day, month, year = date.group(1).split()
        for_date = dt.datetime.strptime(f'{day} {month[:3]} {year}', '%d %b %Y').date()
    else:
        for_date = dt.datetime.fromisoformat(latest['publishedAt']).date() + dt.timedelta(days=1)
    outlook = re.search(r'\s3\.\s+(.+?)(?=\s(?:Activity Guidelines|\d\.)\s)', text)
    return {'text': m.group(1), 'low': rng[0], 'high': rng[1], 'forDate': for_date.isoformat(),
            'url': latest['url'], 'publishedAt': latest.get('publishedAt'),
            'outlook': outlook.group(1)[:600] if outlook else None}


def model_forecast(fetch, target, pm25_history, now):
    """CAMS PM2.5 for the target day, scaled by how far CAMS was off NEA's readings over the last 48h."""
    lat = ','.join(str(COORDS[r][0]) for r in REGIONS)
    lon = ','.join(str(COORDS[r][1]) for r in REGIONS)
    query = urllib.parse.urlencode({'latitude': lat, 'longitude': lon, 'hourly': 'pm2_5', 'timezone': 'Asia/Singapore',
                                    'past_days': 2, 'forecast_days': 3})
    payload = json.loads(fetch(CAMS + query))
    payload = payload if isinstance(payload, list) else [payload]
    observed = {p['timestamp'][:13]: p['values'] for p in pm25_history}
    since = (now - dt.timedelta(hours=48)).strftime('%Y-%m-%dT%H')
    result = {}
    for region, location in zip(REGIONS, payload):
        hours = location['hourly']
        series = [(t[:13], v) for t, v in zip(hours['time'], hours['pm2_5']) if v is not None]
        pairs = [(observed[t][region], v) for t, v in series
                 if since <= t <= now.strftime('%Y-%m-%dT%H') and t in observed and region in observed[t]]
        ahead = [v for t, v in series if t.startswith(target.isoformat())]
        if len(pairs) < 12 or len(ahead) < 18:
            continue
        bias = min(3.0, max(0.33, sum(o for o, _ in pairs) / max(1.0, sum(m for _, m in pairs))))
        pm = sum(ahead) / len(ahead) * bias
        result[region] = {'psi': round(psi_from_pm25(pm)), 'pm25': round(pm, 1), 'bias': round(bias, 2)}
    if not result:
        raise ValueError('Model run did not cover the target day')
    return result


def weather_outlook(fetch, target):
    payload = json.loads(fetch(OUTLOOK))
    for record in payload.get('data', {}).get('records', []):
        for day in record.get('forecasts', []):
            if day.get('timestamp', '')[:10] == target.isoformat():
                text = day.get('forecast', {}).get('summary') or day.get('forecast', {}).get('text', '')
                wind = day.get('wind', {})
                direction = wind.get('direction', '')
                rain = bool(re.search(r'shower|rain|thunder', text, re.I))
                # Smoke reaches Singapore from Sumatra (S/SW) and Kalimantan (SE) on southerly winds.
                carries = 'S' in direction
                factor = (0.92 if rain else 1.0) * (1.0 if carries or not direction else 0.85)
                return {'date': target.isoformat(), 'text': text, 'windDirection': direction,
                        'windSpeed': wind.get('speed'), 'rain': rain, 'southerly': carries, 'factor': round(factor, 2)}
    raise ValueError('No outlook for target day')


def trend_forecast(psi, psi_history):
    """Persistence plus half of the last 24h change, per region."""
    current = psi.get('readings', {}).get('psi_twenty_four_hourly', {})
    latest = dt.datetime.fromisoformat(psi['timestamp'])
    past = {}
    for point in psi_history:
        age = abs((latest - dt.timedelta(hours=24) - dt.datetime.fromisoformat(point['timestamp'])).total_seconds())
        if age <= 7200 and (not past or age < past['age']):
            past = {'age': age, 'values': point['values']}
    result = {}
    for region in REGIONS:
        now_value = current.get(region)
        if not isinstance(now_value, (int, float)):
            continue
        change = now_value - past['values'][region] if past and region in past.get('values', {}) else 0
        result[region] = {'psi': round(min(now_value * 1.5, max(now_value * 0.5, now_value + change / 2))), 'change24h': change}
    return result


def span(values):
    return {'low': round(min(values)), 'high': round(max(values))} if values else None


def build(fetch, data, now):
    """Return (forecast, statuses, errors). data is the refreshed snapshot."""
    target = now.date() + dt.timedelta(days=1)
    statuses, errors, got = {}, [], {}
    jobs = {
        'forecast_nea': lambda: official_forecast(fetch, data.get('advisories', [])),
        'forecast_model': lambda: model_forecast(fetch, target, data.get('history', {}).get('pm25', []), now),
        'forecast_weather': lambda: weather_outlook(fetch, target),
    }
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(fn): key for key, fn in jobs.items()}
        for future in concurrent.futures.as_completed(futures):
            key = futures[future]
            try:
                got[key] = future.result()
                statuses[key] = {'ok': True, 'checkedAt': now.isoformat()}
            except Exception as exc:
                errors.append(f'{key}: {type(exc).__name__}')
                statuses[key] = {'ok': False, 'checkedAt': now.isoformat(), 'error': type(exc).__name__}
    if not data.get('psi'):
        return None, statuses, errors
    official = got.get('forecast_nea')
    if official and official['forDate'] != target.isoformat():
        official = None  # Tonight's update is not out yet; yesterday's covered today.
    weather = got.get('forecast_weather')
    model = got.get('forecast_model') or {}
    trend = trend_forecast(data['psi'], data.get('history', {}).get('psi', []))
    factor = weather['factor'] if weather else 1.0
    regions = {}
    for region in REGIONS:
        estimates = []
        if region in trend:
            estimates.append(trend[region]['psi'] * factor)
        if region in model:
            estimates.append(model[region]['psi'])
        if estimates:
            regions[region] = sum(estimates) / len(estimates)
    if not regions:
        return None, statuses, errors
    blended = span(list(regions.values()))
    psi = dict(blended)
    if official:
        psi = {'low': round(0.6 * official['low'] + 0.4 * blended['low']),
               'high': round(0.6 * official['high'] + 0.4 * blended['high'])}
        mid_before = (blended['low'] + blended['high']) / 2 or 1
        scale = (psi['low'] + psi['high']) / 2 / mid_before
        regions = {r: v * scale for r, v in regions.items()}
    trend_span = span([v['psi'] * factor for v in trend.values()])
    model_span = span([v['psi'] for v in model.values()])
    if official:
        overlap = blended['high'] >= official['low'] and blended['low'] <= official['high']
        confidence = 'high' if overlap else 'medium'
    elif trend_span and model_span:
        mid_t, mid_m = sum(trend_span.values()) / 2, sum(model_span.values()) / 2
        confidence = 'medium' if abs(mid_t - mid_m) <= 0.25 * max(mid_t, mid_m, 1) else 'low'
    else:
        confidence = 'low'
    model_pm = [v['pm25'] for v in model.values()]
    forecast = {
        'targetDate': target.isoformat(), 'issuedAt': now.isoformat(), 'psi': psi,
        'regions': {r: round(v) for r, v in regions.items()}, 'confidence': confidence,
        'official': official,
        'trend': trend_span and {**trend_span, 'change24h': round(max((v['change24h'] for v in trend.values()), key=abs))},
        'model': model_span and {**model_span, 'pm25': round(sum(model_pm) / len(model_pm)),
                                 'bias': round(sum(v['bias'] for v in model.values()) / len(model), 2)},
        'weather': weather,
    }
    return forecast, statuses, errors


def update_log(log, forecast, psi_history, now):
    """Keep the last forecast issued for each day, then score it once that day's readings are in."""
    entries = {e['targetDate']: e for e in log or []}
    if forecast:
        entries[forecast['targetDate']] = {'targetDate': forecast['targetDate'], 'issuedAt': forecast['issuedAt'],
                                           'low': forecast['psi']['low'], 'high': forecast['psi']['high'],
                                           'official': bool(forecast.get('official'))}
    today = now.date().isoformat()
    for date, entry in entries.items():
        if date >= today or 'actualHigh' in entry:
            continue
        values = [v for p in psi_history if p['timestamp'][:10] == date for v in p['values'].values()]
        hours = {p['timestamp'][:13] for p in psi_history if p['timestamp'][:10] == date}
        if len(hours) >= 18:
            entry['actualLow'], entry['actualHigh'] = min(values), max(values)
            entry['hit'] = entry['low'] * 0.9 <= entry['actualHigh'] <= entry['high'] * 1.1
    return sorted(entries.values(), key=lambda e: e['targetDate'])[-LOG_DAYS:]
