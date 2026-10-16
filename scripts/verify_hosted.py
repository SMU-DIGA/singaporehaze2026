"""Read the Sites service token from hidden stdin; never log or save it."""
import json
import getpass
import sys
import urllib.request

site_url = sys.argv[1].rstrip('/')
token = getpass.getpass('Sites service token (hidden): ') if sys.stdin.isatty() else sys.stdin.readline().strip()
headers = {'OAI-Sites-Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}
try:
    with urllib.request.urlopen(urllib.request.Request(site_url + '/api/refresh', data=b'{}', headers=headers, method='POST'), timeout=180) as r:
        write_result = json.load(r)
    with urllib.request.urlopen(urllib.request.Request(site_url + '/api/data', headers=headers), timeout=30) as r:
        read_result = json.load(r)
    assert write_result.get('persistedAt') == read_result.get('persistedAt'), 'Readback mismatch'
    assert read_result.get('sources', {}).get('psi', {}).get('ok'), 'PSI upstream failed'
    assert read_result.get('sources', {}).get('pm25', {}).get('ok'), 'PM2.5 upstream failed'
    assert len(read_result.get('news', [])) > 0, 'Missing news'
    assert len(read_result.get('advisories', [])) > 0, 'Missing official advisories'
    print(json.dumps({'verified': True, 'generatedAt': read_result['generatedAt'], 'persistedAt': read_result['persistedAt'], 'news': len(read_result['news']), 'advisories': len(read_result['advisories']), 'errors': read_result.get('errors', [])}))
except Exception as exc:
    print(json.dumps({'verified': False, 'error': type(exc).__name__}))
    sys.exit(1)
