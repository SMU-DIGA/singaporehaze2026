"""Air quality in nearby destinations, for people thinking of leaving during the haze.

Every city, Singapore included, comes from the same model (CAMS via Open-Meteo),
so the list compares like with like. The AQI is the US EPA index from 24-hour
mean PM2.5, matching how haze is reported; ozone is left out on purpose.

Each city has a `price` slot for a cheapest-fare source; until one is connected
the page links to flight searches instead.
"""
import datetime as dt
import json
from pathlib import Path
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'public/data/escape.json'
SGT = dt.timezone(dt.timedelta(hours=8))
API = 'https://air-quality-api.open-meteo.com/v1/air-quality?'
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
            request = urllib.request.Request(url, headers={'User-Agent': 'SingaporeHazeWatch/1.0 (+https://github.com/SMU-DIGA/singaporehaze2026)'})
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
    result.update({'generatedAt': now.isoformat(), 'source': 'CAMS via Open-Meteo', 'schemaVersion': 1})
    temporary = OUTPUT.with_suffix('.tmp')
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(OUTPUT)
    print(f'Updated {OUTPUT.relative_to(ROOT)}; {len(result["cities"])} cities')


if __name__ == '__main__':
    main()
