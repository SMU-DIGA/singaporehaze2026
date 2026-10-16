"""Haze resources: free N95 mask vending machines (with live stock), Community
Clubs (mask collection counters and haze shelters) and polyclinics for the map,
and NEA's list of portable air cleaners with their smoke CADR for the calculator.

Mask stock comes from the government's HazeMaskGoWhere locator, whose data file
cannot be read cross-origin by browsers, so the server mirrors it. The file is
only rewritten when something other than the check time changed, so frequent
runs do not create empty commits.
"""
import datetime as dt
import email.utils
import html
import json
import os
from pathlib import Path
import re
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'public/data/resources.json'
SGT = dt.timezone(dt.timedelta(hours=8))
MASKS = 'https://www.gowhere.gov.sg/hazemask/data/data.webhook.json'
MASKS_PAGE = 'https://www.gowhere.gov.sg/hazemask/'
DATASET = 'https://api-open.data.gov.sg/v1/public/api/datasets/{}/poll-download'
CC_DATASET = 'd_9de02d3fb33d96da1855f4fbef549a0f'  # PA: Community Club / PAssion WaVe Outlet
POLYCLINIC_DATASET = 'd_3ca2a28059588f297908b32da4ac3cbe'  # HPB: screening centres (all polyclinics)
PURIFIERS = 'https://www.nea.gov.sg/our-services/public-cleanliness/environmental-cleaning-guidelines/guidelines/list-of-portable-air-cleaners-against-covid-19-virus-aerosols'
STATIC_MAX_AGE = dt.timedelta(days=7)
STOCK = {'stocksAvailable': 'available', 'limitedStocksAvailable': 'limited', 'outOfStock': 'out'}


def fetch(url):
    """Return (body, Last-Modified as datetime or None)."""
    headers = {'User-Agent': 'SingaporeHazeWatch/1.0 (+https://github.com/SMU-DIGA/singaporehaze2026)'}
    if os.getenv('DATA_GOV_SG_API_KEY') and 'data.gov.sg' in url:
        headers['x-api-key'] = os.environ['DATA_GOV_SG_API_KEY']
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=25) as r:
                modified = r.headers.get('Last-Modified')
                return r.read().decode('utf-8'), email.utils.parsedate_to_datetime(modified) if modified else None
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def flags(row, category):
    return [o['name'] for f in row.get('filters', []) if f.get('category') == category for o in f.get('options', []) if o.get('flag')]


def mask_points(body, modified):
    payload = json.loads(body)
    items = []
    for row in payload.get('data', []):
        lat, lon = row.get('LAT'), row.get('LON')
        if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
            continue
        stock = next((STOCK[s] for s in flags(row, 'stock') if s in STOCK), 'unknown')
        items.append({'name': row.get('name', '').strip(), 'address': row.get('address', '').strip(),
                      'postal': row.get('postalCode'), 'lat': round(lat, 6), 'lon': round(lon, 6),
                      'hours': row.get('operatingHoursFreeText'), 'note': row.get('description') or None,
                      'stock': stock, 'working': 'notAvailable' not in flags(row, 'machine')})
    if not items:
        raise ValueError('No mask collection points')
    return {'updatedAt': modified.astimezone(SGT).isoformat() if modified else None,
            'label': payload.get('lastUpdated'), 'source': MASKS_PAGE,
            'items': sorted(items, key=lambda x: x['name'])}


def dataset_points(dataset_id, keep):
    url = json.loads(fetch(DATASET.format(dataset_id))[0])['data']['url']
    features = json.loads(fetch(url)[0])['features']
    items = []
    for feature in features:
        p, geometry = feature.get('properties', {}), feature.get('geometry') or {}
        if geometry.get('type') != 'Point' or not keep(p):
            continue
        clean = lambda v: v if v not in (None, '', 'None', 'NIL') else None  # noqa: E731
        street = ' '.join(x for x in (clean(p.get('ADDRESSBLOCKHOUSENUMBER')), clean(p.get('ADDRESSSTREETNAME'))) if x)
        lon, lat = geometry['coordinates'][:2]
        items.append({'name': p['NAME'].strip(), 'address': street, 'postal': clean(p.get('ADDRESSPOSTALCODE')),
                      'lat': round(lat, 6), 'lon': round(lon, 6)})
    if not items:
        raise ValueError(f'No points in {dataset_id}')
    return sorted(items, key=lambda x: x['name'])


def purifier_list(body):
    """NEA's table: brand and model, category, filter grade, smoke CADR (filters alone / overall) in m³/h."""
    cells = lambda row: [re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', c))).strip()
                         for c in re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', row, re.S)]
    number = lambda text: int(re.sub(r'\D', '', text)) if re.sub(r'\D', '', text) else None
    items = []
    for table in re.findall(r'<table.*?</table>', body, re.S):
        rows = [cells(r) for r in re.findall(r'<tr.*?</tr>', table, re.S)]
        if not rows or 'Brand and Model' not in rows[0]:
            continue
        for row in rows[1:]:
            if len(row) < 6 or not number(row[5]):
                continue
            items.append({'model': row[1], 'electronic': 'electronic' in row[2].lower(), 'filter': row[3],
                          'cadrFilter': number(row[4]), 'cadrOverall': number(row[5])})
    if not items:
        raise ValueError('No air cleaners in NEA list')
    updated = re.search(r'Last updated(?: on)? (\d{1,2} \w+ \d{4})', body)
    listed = None
    if updated:
        day, month, year = updated.group(1).split()
        listed = dt.datetime.strptime(f'{day} {month[:3]} {year}', '%d %b %Y').date().isoformat()
    return {'source': PURIFIERS, 'listUpdated': listed, 'items': items}


def main():
    previous = json.loads(OUTPUT.read_text()) if OUTPUT.exists() else {}
    now = dt.datetime.now(SGT)
    result = {k: v for k, v in previous.items() if k in ('masks', 'ccs', 'polyclinics', 'purifiers')}
    errors = []
    try:
        result['masks'] = mask_points(*fetch(MASKS))
    except Exception as exc:
        errors.append(f'masks: {type(exc).__name__}')
    static = {
        'ccs': (CC_DATASET, lambda p: p.get('DESCRIPTION') == 'CC'),
        'polyclinics': (POLYCLINIC_DATASET, lambda p: 'polyclinic' in (p.get('NAME') or '').lower()),
    }
    fetched = (previous.get('purifiers') or {}).get('fetchedAt')
    if not fetched or now - dt.datetime.fromisoformat(fetched) >= STATIC_MAX_AGE:
        try:
            result['purifiers'] = {'fetchedAt': now.isoformat(), **purifier_list(fetch(PURIFIERS)[0])}
        except Exception as exc:
            errors.append(f'purifiers: {type(exc).__name__}')
    for key, (dataset_id, keep) in static.items():
        fetched = (previous.get(key) or {}).get('fetchedAt')
        if fetched and now - dt.datetime.fromisoformat(fetched) < STATIC_MAX_AGE:
            continue
        try:
            result[key] = {'fetchedAt': now.isoformat(), 'dataset': dataset_id, 'items': dataset_points(dataset_id, keep)}
        except Exception as exc:
            errors.append(f'{key}: {type(exc).__name__}')
    result['errors'] = errors
    unchanged = {k: v for k, v in previous.items() if k != 'generatedAt'} == {**result, 'schemaVersion': 1}
    if unchanged:
        print(f'Resources unchanged; errors: {errors}')
        return
    result.update({'generatedAt': now.isoformat(), 'schemaVersion': 1})
    temporary = OUTPUT.with_suffix('.tmp')
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(OUTPUT)
    masks = result.get('masks', {}).get('items', [])
    print(f'Updated {OUTPUT.relative_to(ROOT)}; {len(masks)} mask points, '
          f'{len(result.get("ccs", {}).get("items", []))} CCs, {len(result.get("polyclinics", {}).get("items", []))} polyclinics, '
          f'{len(result.get("purifiers", {}).get("items", []))} air cleaners; errors: {errors}')


if __name__ == '__main__':
    main()
