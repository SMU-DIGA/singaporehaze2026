"""Unattended public-source aggregation; no API keys or third-party packages."""
import concurrent.futures
import datetime as dt
import email.utils
import html
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'public/data/latest.json'
SGT = dt.timezone(dt.timedelta(hours=8))
REGIONS = ['north', 'south', 'east', 'west', 'central']
API = 'https://api-open.data.gov.sg/v2/real-time/api/'
NEA = 'https://www.nea.gov.sg/media/news'
CNA = 'https://www.channelnewsasia.com/topic/haze'


def government_news():
    payload = json.loads(fetch('https://www.nea.gov.sg/media/news/GetData/1/0/0/haze'))
    result = []
    for item in payload.get('Data', []):
        title = html.unescape(re.sub(r'<[^>]*>', '', item.get('Title', '')))
        if not re.search(r'haze|雾霾', title, re.I):
            continue
        section = 'advisories' if item.get('NewsOrAdvisory') == 'Advisory' else 'news'
        result.append({'title': title, 'url': f'https://www.nea.gov.sg/media/news/{section}/index/{item["UrlName"]}',
                       'source': 'NEA', 'publishedAt': item.get('DateOfArticleStr'), 'category': 'government'})
    return result[:12]


def fetch(url):
    for attempt in range(3):
        try:
            headers = {'User-Agent': 'SingaporeHazeWatch/1.0 (+https://github.com/SMU-DIGA/singaporehaze2026)'}
            if os.getenv('DATA_GOV_SG_API_KEY') and url.startswith(API):
                headers['x-api-key'] = os.environ['DATA_GOV_SG_API_KEY']
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=25) as r:
                return r.read().decode('utf-8')
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def api_items(kind, date=None):
    params = {'date': date} if date else {}
    items, seen = [], set()
    while True:
        payload = json.loads(fetch(API + kind + ('?' + urllib.parse.urlencode(params) if params else '')))
        if payload.get('code') != 0 or not isinstance(payload.get('data'), dict):
            raise ValueError('Official API returned an error')
        data = payload['data']
        items.extend(data.get('items', []))
        token = data.get('paginationToken')
        if not token or token in seen:
            break
        seen.add(token)
        params['paginationToken'] = token
    return items


def validate_reading(item, key):
    values = item.get('readings', {}).get(key, {})
    if not all(isinstance(values.get(r), (int, float)) and not isinstance(values[r], bool)
               and 0 <= values[r] <= 5000 for r in REGIONS):
        raise ValueError('Missing or invalid regional readings')
    dt.datetime.fromisoformat(item['timestamp'])
    return item


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links, self.current, self.parts = [], None, []

    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            self.current = dict(attrs).get('href')
            self.parts = []

    def handle_data(self, data):
        if self.current:
            self.parts.append(data)

    def handle_endtag(self, tag):
        if tag == 'a' and self.current:
            self.links.append((self.current, ' '.join(' '.join(self.parts).split())))
            self.current = None


def extract_links(markup, base, government=False):
    parser = Links()
    parser.feed(markup)
    result, seen = [], set()
    for href, text in parser.links:
        url = urllib.parse.urljoin(base, href).split('#')[0]
        host = urllib.parse.urlparse(url).hostname or ''
        is_article = '/index/' in url if government else bool(re.search(r'-\d{5,}$', url))
        if 'haze' not in (text + url).lower() or not is_article or url in seen or len(text) < 18:
            continue
        if host not in ('www.nea.gov.sg', 'www.channelnewsasia.com'):
            continue
        seen.add(url)
        text = re.sub(r'^\s*(Advisory|News|Singapore|Asia)\s+', '', text)
        date = re.search(r'(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+20\d\d)', text)
        result.append({'title': text[:220], 'url': url, 'source': 'NEA' if government else 'CNA',
                       'publishedAt': date.group(1) if date else None,
                       'category': 'government' if government else ('regional' if '/asia/' in url else 'singapore')})
    return result[:18]


def rss_news():
    query = '(Singapore haze OR 新加坡 雾霾) when:7d'
    url = 'https://news.google.com/rss/search?' + urllib.parse.urlencode({'q': query, 'hl': 'en-SG', 'gl': 'SG', 'ceid': 'SG:en'})
    root = ET.fromstring(fetch(url))
    result = []
    trusted = ('channelnewsasia.com', 'straitstimes.com', 'zaobao.com', 'todayonline.com', 'bbc.com', 'reuters.com')
    for node in root.findall('./channel/item'):
        source = node.find('source')
        host = urllib.parse.urlparse(source.get('url', '') if source is not None else '').hostname or ''
        if not any(host == h or host.endswith('.' + h) for h in trusted):
            continue
        title = html.unescape(node.findtext('title', ''))
        if not re.search(r'haze|雾霾|烟霾', title, re.I):
            continue
        date = email.utils.parsedate_to_datetime(node.findtext('pubDate'))
        result.append({'title': title, 'url': node.findtext('link'), 'source': source.text,
                       'publishedAt': date.isoformat(), 'category': 'regional' if re.search(r'Indonesia|Malaysia|印尼|马来', title, re.I) else 'singapore'})
    return result[:24]


def main():
    previous = json.loads(OUTPUT.read_text()) if OUTPUT.exists() else {}
    now = dt.datetime.now(SGT)
    errors = []
    statuses = {}
    result = dict(previous)
    jobs = {
        'psi': lambda: validate_reading(max(api_items('psi'), key=lambda x: x['timestamp']), 'psi_twenty_four_hourly'),
        'pm25': lambda: validate_reading(max(api_items('pm25'), key=lambda x: x['timestamp']), 'pm25_one_hourly'),
        'advisories': government_news,
        'news': rss_news,
        'cna': lambda: extract_links(fetch(CNA), CNA),
    }
    for days in range(3):
        date = (now - dt.timedelta(days=days)).strftime('%Y-%m-%d')
        for kind in ('psi', 'pm25'):
            jobs[f'history_{kind}_{date}'] = lambda k=kind, d=date: api_items(k, d)
    histories = {'psi': [], 'pm25': []}
    cna = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(fn): key for key, fn in jobs.items()}
        for future in concurrent.futures.as_completed(futures):
            key = futures[future]
            try:
                value = future.result()
                if not value:
                    raise ValueError('Source returned no usable content')
                if key.startswith('history_'):
                    histories[key.split('_')[1]].extend(value)
                elif key == 'cna':
                    cna = value
                else:
                    result[key] = value
                statuses[key] = {'ok': True, 'checkedAt': now.isoformat()}
            except Exception as exc:
                errors.append(f'{key}: {type(exc).__name__}')
                statuses[key] = {'ok': False, 'checkedAt': now.isoformat(), 'error': type(exc).__name__}
    for kind, items in histories.items():
        key = 'psi_twenty_four_hourly' if kind == 'psi' else 'pm25_one_hourly'
        existing = previous.get('history', {}).get(kind, [])
        points = {p['timestamp']: p for p in existing}
        for item in items:
            try:
                validate_reading(item, key)
                points[item['timestamp']] = {'timestamp': item['timestamp'], 'values': item['readings'][key]}
            except (ValueError, KeyError):
                continue
        cutoff = now - dt.timedelta(hours=72)
        histories[kind] = sorted((p for t, p in points.items() if dt.datetime.fromisoformat(t) >= cutoff), key=lambda p: p['timestamp'])
    result['history'] = histories
    # Prefer direct publisher URLs; supplement with attributed RSS headlines.
    combined = cna + result.get('news', [])
    seen = set()
    result['news'] = []
    for item in combined:
        title_key = re.sub(r'\W', '', item['title'].lower().split(' - ')[0])
        if title_key not in seen:
            seen.add(title_key)
            result['news'].append(item)
    result['news'] = result['news'][:24]
    next_run = now.replace(minute=17, second=0, microsecond=0)
    while next_run <= now or next_run.hour % 3 != 0:
        next_run += dt.timedelta(hours=1)
    result.update({'generatedAt': now.isoformat(), 'nextUpdateAt': next_run.isoformat(),
                   'sources': statuses, 'errors': errors, 'schemaVersion': 1})
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix('.tmp')
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(OUTPUT)
    print(f'Updated {OUTPUT.relative_to(ROOT)}; {len(result["news"])} news, {len(result.get("advisories", []))} advisories; errors: {errors}')
    # Leave the valid fallback file intact, but make critical source failures visible in CI.
    if not statuses['psi']['ok'] or not statuses['pm25']['ok']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
