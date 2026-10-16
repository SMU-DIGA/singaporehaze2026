"""Air quality in nearby destinations, for people thinking of leaving during the haze.

Every city, Singapore included, comes from the same model (CAMS via Open-Meteo),
so the list compares like with like. The AQI is the US EPA index from 24-hour
mean PM2.5, matching how haze is reported; ozone is left out on purpose.

Fares come from Kiwi.com's official public MCP server (https://mcp.kiwi.com, no key):
tomorrow's cheapest one-way economy fare for one adult on a single booking (no
self-transfers), plus the cheapest direct fare. To stay light on a free service, fares are re-checked at most every
PRICE_MAX_AGE, one city at a time.
"""
import datetime as dt
import json
from pathlib import Path
import re
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'public/data/escape.json'
SGT = dt.timezone(dt.timedelta(hours=8))
API = 'https://air-quality-api.open-meteo.com/v1/air-quality?'
KIWI = 'https://mcp.kiwi.com'
PRICE_MAX_AGE = dt.timedelta(hours=4)
UA = 'SingaporeHazeWatch/1.0 (+https://github.com/SMU-DIGA/singaporehaze2026)'
# (IATA, Chinese, English, country code, lat, lon, typical direct flight time from SIN in minutes)
CITIES = [
    ('SIN', '新加坡', 'Singapore', 'SG', 1.35, 103.82, 0),
    ('KUL', '吉隆坡', 'Kuala Lumpur', 'MY', 3.139, 101.687, 60),
    ('PEN', '槟城', 'Penang', 'MY', 5.414, 100.329, 85),
    ('BKI', '亚庇', 'Kota Kinabalu', 'MY', 5.98, 116.073, 150),
    ('BKK', '曼谷', 'Bangkok', 'TH', 13.756, 100.502, 145),
    ('HKT', '普吉', 'Phuket', 'TH', 7.88, 98.392, 95),
    ('CNX', '清迈', 'Chiang Mai', 'TH', 18.788, 98.985, 195),
    ('SGN', '胡志明市', 'Ho Chi Minh City', 'VN', 10.823, 106.63, 120),
    ('DAD', '岘港', 'Da Nang', 'VN', 16.054, 108.202, 165),
    ('HAN', '河内', 'Hanoi', 'VN', 21.028, 105.854, 210),
    ('MNL', '马尼拉', 'Manila', 'PH', 14.6, 120.984, 215),
    ('CEB', '宿务', 'Cebu', 'PH', 10.316, 123.885, 230),
    ('DPS', '巴厘岛', 'Bali', 'ID', -8.65, 115.217, 160),
    ('CGK', '雅加达', 'Jakarta', 'ID', -6.2, 106.845, 105),
    ('HKG', '香港', 'Hong Kong', 'HK', 22.32, 114.17, 235),
    ('TPE', '台北', 'Taipei', 'TW', 25.033, 121.565, 280),
    ('PER', '珀斯', 'Perth', 'AU', -31.95, 115.86, 315),
]


def fetch(url):
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(request, timeout=30) as r:
                return r.read().decode('utf-8')
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def daily_max(times, values, date):
    day = [v for t, v in zip(times, values) if t.startswith(date) and v is not None]
    return max(day) if day else None


def build(payload, now):
    if not isinstance(payload, list) or len(payload) != len(CITIES):
        raise ValueError('Unexpected air quality response')
    tomorrow = (now.date() + dt.timedelta(days=1)).isoformat()
    after = (now.date() + dt.timedelta(days=2)).isoformat()
    cities = []
    for (iata, zh, en, country, lat, lon, minutes), loc in zip(CITIES, payload):
        hourly, current = loc.get('hourly', {}), loc.get('current', {})
        times, aqi = hourly.get('time', []), hourly.get('us_aqi_pm2_5', [])
        cities.append({'iata': iata, 'zh': zh, 'en': en, 'country': country, 'lat': lat, 'lon': lon, 'flightMinutes': minutes,
                       'aqi': current.get('us_aqi_pm2_5'), 'pm25': current.get('pm2_5'),
                       'tomorrowMax': daily_max(times, aqi, tomorrow), 'dayAfterMax': daily_max(times, aqi, after),
                       'price': None})
    if all(c['aqi'] is None for c in cities):
        raise ValueError('No AQI values')
    return {'observedAt': payload[0].get('current', {}).get('time'), 'tomorrow': tomorrow, 'dayAfter': after, 'cities': cities}


def kiwi_search(iata, date):
    """One search-flight call over MCP's streamable HTTP transport (the server is stateless)."""
    day = dt.date.fromisoformat(date).strftime('%d/%m/%Y')
    body = json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call', 'params': {'name': 'search-flight', 'arguments': {
        'flyFrom': 'SIN', 'flyTo': iata, 'departureDate': day, 'currency': 'SGD', 'cabinClass': 'M',
        # Separate tickets with self-transfers leave travellers stranded if a leg is late.
        'allow_self_transfer': False}}}).encode()
    request = urllib.request.Request(KIWI, data=body, headers={'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'User-Agent': UA})
    with urllib.request.urlopen(request, timeout=60) as r:
        raw = r.read().decode('utf-8')
    event = re.search(r'^data: (.*)$', raw, re.M)
    result = json.loads(event.group(1) if event else raw)['result']
    if result.get('isError'):
        raise ValueError('Kiwi search failed')
    return json.loads(result['content'][0]['text'])


def cheapest(search, date, now):
    trips = [t for t in search.get('itineraries', []) if isinstance(t.get('price'), (int, float))]
    fare = {'date': date, 'checkedAt': now.isoformat(), 'source': 'Kiwi.com', 'currency': search.get('currency', 'SGD')}
    if not trips:
        return {**fare, 'amount': None}
    best = min(trips, key=lambda t: t['price'])
    direct = [t for t in trips if t.get('outbound', {}).get('stops') == 0]
    best_direct = min(direct, key=lambda t: t['price']) if direct else None
    legs = best.get('outbound', {})
    return {**fare, 'amount': round(best['price']), 'url': best.get('bookingUrl'), 'stops': legs.get('stops'),
            'hours': round(best.get('totalDurationSeconds', 0) / 3600, 1),
            'carriers': sorted({s.get('carrierName') for s in legs.get('segments', []) if s.get('carrierName')}),
            'direct': {'amount': round(best_direct['price']), 'url': best_direct.get('bookingUrl')} if best_direct else None}


def add_prices(result, previous, now, search=kiwi_search, pause=1.5):
    """Fill each city's tomorrow fare, reusing a fare for the same date checked recently."""
    old = {c['iata']: c.get('price') for c in (previous or {}).get('cities', [])}
    errors, first = [], True
    for city in result['cities']:
        if city['iata'] == 'SIN':
            continue
        kept = old.get(city['iata'])
        fresh = kept and kept.get('date') == result['tomorrow'] and now - dt.datetime.fromisoformat(kept['checkedAt']) < PRICE_MAX_AGE
        if fresh:
            city['price'] = kept
            continue
        if not first:
            time.sleep(pause)
        first = False
        try:
            city['price'] = cheapest(search(city['iata'], result['tomorrow']), result['tomorrow'], now)
        except Exception as exc:
            errors.append(f"{city['iata']}: {type(exc).__name__}")
            city['price'] = kept if kept and kept.get('date') == result['tomorrow'] else None
    return errors


def main():
    now = dt.datetime.now(SGT)
    query = urllib.parse.urlencode({
        'latitude': ','.join(str(c[4]) for c in CITIES), 'longitude': ','.join(str(c[5]) for c in CITIES),
        'current': 'us_aqi_pm2_5,pm2_5', 'hourly': 'us_aqi_pm2_5', 'forecast_days': 3, 'timezone': 'Asia/Singapore',
    })
    try:
        result = build(json.loads(fetch(API + query)), now)
    except Exception as exc:
        # Keep the last good list; the page shows its age.
        print(f'Escape list not updated: {type(exc).__name__}')
        return
    previous = json.loads(OUTPUT.read_text()) if OUTPUT.exists() else {}
    price_errors = add_prices(result, previous, now)
    result.update({'generatedAt': now.isoformat(), 'source': 'CAMS via Open-Meteo', 'priceErrors': price_errors, 'schemaVersion': 1})
    temporary = OUTPUT.with_suffix('.tmp')
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(OUTPUT)
    priced = sum(1 for c in result['cities'] if (c.get('price') or {}).get('amount'))
    print(f'Updated {OUTPUT.relative_to(ROOT)}; {len(result["cities"])} cities, {priced} fares; fare errors: {price_errors}')


if __name__ == '__main__':
    main()
