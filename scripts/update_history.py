"""Year-over-year haze comparison from NEA's hourly regional 24-hr PSI.

Days come from three places, in order of authority:
1. NEA's "Historical 24-hr PSI" dataset on data.gov.sg (Apr 2014 onwards, refreshed
   about monthly), re-downloaded at most every CSV_MAX_AGE;
2. the real-time PSI API by date, for days between the dataset's end and the last week;
3. the hourly snapshot's own last-8-days history, for recent days and today.

Each day keeps the island-wide maximum (highest of the five regions) and its region.
The full day map is a cache in data/psi-daily.json; the page reads the smaller
public/data/history.json (per-year figures and haze-season series).
"""
import csv
import datetime as dt
import io
import json
from pathlib import Path
import re
import sys
import time
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parent))
import update_data  # noqa: E402  (fetch with API key, paginated real-time API)

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'data/psi-daily.json'
OUTPUT = ROOT / 'public/data/history.json'
LATEST = ROOT / 'public/data/latest.json'
SGT = update_data.SGT
REGIONS = update_data.REGIONS
DATASET = 'd_b4cf557f8750260d229c49fd768e11ed'
POLL = f'https://api-open.data.gov.sg/v1/public/api/datasets/{DATASET}/poll-download'
CSV_MAX_AGE = dt.timedelta(days=7)
API_DAYS_PER_RUN = 60
SEASON = ('08-01', '11-30')  # the southwest-monsoon haze season, for the overlay chart
NOTABLE = [2015, 2019, 2023]
EPISODE_GAP = 10  # unhealthy days at most this far apart belong to one haze episode
EPISODE_MIN_DAYS = 3  # fewer unhealthy days than this is a one-off spike, not an episode
# Before April 2014 the PSI excluded PM2.5 and headlines used the 3-hour PSI, so these
# are shown apart from the table rather than ranked against it.
OLDER = [
    {'year': 2013, 'value': 401, 'measure': '3-hr PSI', 'date': '2013-06-21',
     'source': 'https://www.nas.gov.sg/archivesonline/data/pdfdoc/20130628001/haze_update_from_nea_(21jun13).pdf'},
    {'year': 1997, 'value': 226, 'measure': '3-hr PSI', 'date': '1997-09-18', 'source': None},
]


def parse_time(text):
    m = re.fullmatch(r'(\d{1,2})/(\d{1,2})/(\d{4}) (\d{1,2}):(\d{2})', text.strip())
    if m:
        d, mo, y, h, mi = map(int, m.groups())
        return dt.datetime(y, mo, d, h, mi)
    m = re.fullmatch(r'(\d{4})-(\d{2})-(\d{2}) 0*(\d{1,2}):(\d{2}):\d{2}', text.strip())  # one malformed 2016 row
    if m:
        y, mo, d, h, mi = map(int, m.groups())
        return dt.datetime(y, mo, d, h, mi)
    raise ValueError(f'Unrecognised time {text!r}')


def merge(daily, date, values):
    """Keep the day's highest regional reading."""
    valid = {r: v for r, v in values.items() if isinstance(v, (int, float)) and 0 <= v <= 1000}
    if not valid:
        return
    region = max(valid, key=valid.get)
    if date not in daily or daily[date][0] is None or valid[region] > daily[date][0]:
        daily[date] = [valid[region], region]


def parse_csv(text):
    daily, last = {}, None
    for row in csv.DictReader(io.StringIO(text)):
        try:
            when = parse_time(row['24hr_psi'])
        except ValueError:
            continue
        values = {r: int(row[r]) for r in REGIONS if (row.get(r) or '').strip().lstrip('-').isdigit()}
        merge(daily, when.date().isoformat(), values)
        last = max(last, when) if last else when
    if not daily:
        raise ValueError('Empty dataset')
    return daily, last.date().isoformat()


def download_csv():
    for attempt in range(5):
        meta = json.loads(update_data.fetch(POLL))
        url = (meta.get('data') or {}).get('url')
        if url:
            with urllib.request.urlopen(url, timeout=60) as r:
                return r.read().decode('utf-8-sig')
        time.sleep(12)  # code 24 TOO_MANY_REQUESTS: the download endpoint wants ~10 s between calls
    raise ValueError('Dataset download not available')


def api_day(date):
    daily = {}
    for item in update_data.api_items('psi', date):
        merge(daily, item['timestamp'][:10], item.get('readings', {}).get('psi_twenty_four_hourly', {}))
    return daily.get(date)


def summarise(daily, today):
    years = {}
    for date, (value, region) in sorted(daily.items()):
        if value is None:
            continue
        y = years.setdefault(int(date[:4]), {'year': int(date[:4]), 'peak': -1, 'days100': 0, 'days200': 0, 'days300': 0, 'days': 0})
        y['days'] += 1
        if value > y['peak']:
            y.update(peak=value, peakDate=date, peakRegion=region)
        for limit in (100, 200, 300):
            y[f'days{limit}'] += value > limit
    rows = sorted(years.values(), key=lambda y: y['year'])
    for y in rows:
        y['partial'] = y['year'] == today.year or (y['year'] == 2014)  # dataset starts April 2014
    season_years = sorted({today.year, *NOTABLE} & set(years))
    season = {}
    for year in season_years:
        start, end = (dt.date.fromisoformat(f'{year}-{d}') for d in SEASON)
        season[year] = [daily.get((start + dt.timedelta(days=i)).isoformat(), [None])[0] for i in range((end - start).days + 1)]
    return rows, season


def episodes(daily, today):
    """Haze episodes: runs of days above PSI 100 with gaps of at most EPISODE_GAP days.
    An episode whose last unhealthy day is within two days of today is still ongoing."""
    dates = sorted(dt.date.fromisoformat(d) for d, (v, _) in daily.items() if v is not None and v > 100)
    runs, current = [], []
    for date in dates:
        if current and (date - current[-1]).days > EPISODE_GAP:
            runs.append(current)
            current = []
        current.append(date)
    if current:
        runs.append(current)
    result = []
    for run in runs:
        if len(run) < EPISODE_MIN_DAYS:
            continue
        peak = max(run, key=lambda d: daily[d.isoformat()][0])
        result.append({'start': run[0].isoformat(), 'end': run[-1].isoformat(), 'unhealthyDays': len(run),
                       'peak': daily[peak.isoformat()][0], 'peakDate': peak.isoformat(),
                       'ongoing': (today - run[-1]).days <= 2})
    return result


def main():
    now = dt.datetime.now(SGT)
    today = now.date()
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    daily = cache.get('daily', {})
    errors = []
    checked = cache.get('csvCheckedAt')
    if not checked or now - dt.datetime.fromisoformat(checked) > CSV_MAX_AGE:
        try:
            csv_daily, csv_end = parse_csv(download_csv())
            # The dataset is authoritative up to its last full day.
            daily.update({d: v for d, v in csv_daily.items() if d < csv_end})
            cache.update(csvCheckedAt=now.isoformat(), csvEnd=csv_end)
        except Exception as exc:
            errors.append(f'dataset: {type(exc).__name__}')
    csv_end = cache.get('csvEnd')
    # Recent days and today from the hourly snapshot (last 8 days, already fetched).
    latest = json.loads(LATEST.read_text()) if LATEST.exists() else {}
    recent = {}
    for point in latest.get('history', {}).get('psi', []):
        merge(recent, point['timestamp'][:10], point.get('values', {}))
    covered = min(recent) if recent else today.isoformat()
    for date, value in recent.items():
        if not csv_end or date >= csv_end:
            daily[date] = value
    # Days between the dataset and the snapshot, once each, from the real-time API.
    if csv_end:
        day, fetched = dt.date.fromisoformat(csv_end), 0
        while day.isoformat() < covered and fetched < API_DAYS_PER_RUN:
            date = day.isoformat()
            if date not in daily:
                try:
                    daily[date] = api_day(date) or [None, None]
                except Exception as exc:
                    errors.append(f'{date}: {type(exc).__name__}')
                fetched += 1
            day += dt.timedelta(days=1)
    cache['daily'] = dict(sorted(daily.items()))
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(cache, separators=(',', ':')) + '\n')
    years, season = summarise(daily, today)
    result = {'generatedAt': now.isoformat(), 'dataset': DATASET, 'datasetEnd': csv_end, 'seasonStart': SEASON[0],
              'years': years, 'season': {str(y): v for y, v in season.items()}, 'episodes': episodes(daily, today),
              'older': OLDER, 'errors': errors, 'schemaVersion': 1}
    temporary = OUTPUT.with_suffix('.tmp')
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=1) + '\n')
    temporary.replace(OUTPUT)
    print(f'Updated {OUTPUT.relative_to(ROOT)}; {len(daily)} days, {len(years)} years; errors: {errors}')


if __name__ == '__main__':
    main()
