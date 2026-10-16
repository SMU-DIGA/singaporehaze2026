import datetime as dt
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('escape', Path(__file__).resolve().parents[1] / 'scripts/update_escape.py')
escape = importlib.util.module_from_spec(spec)
spec.loader.exec_module(escape)
NOW = dt.datetime(2026, 10, 16, 21, 5, tzinfo=escape.SGT)


def location(now_aqi, by_day):
    times, values = [], []
    for day, value in by_day.items():
        for hour in range(24):
            times.append(f'{day}T{hour:02d}:00')
            values.append(value if hour != 12 else value + 10)  # daily peak at noon
    return {'current': {'time': '2026-10-16T21:00', 'us_aqi_pm2_5': now_aqi, 'pm2_5': 20.0}, 'hourly': {'time': times, 'us_aqi_pm2_5': values}}


PAYLOAD = [location(170 - i, {'2026-10-16': 150, '2026-10-17': 100 + i, '2026-10-18': 80}) for i in range(len(escape.CITIES))]


class EscapeTests(unittest.TestCase):
    def test_city_rows_carry_now_and_next_two_days(self):
        result = escape.build(PAYLOAD, NOW)
        self.assertEqual((result['tomorrow'], result['dayAfter']), ('2026-10-17', '2026-10-18'))
        kl = next(c for c in result['cities'] if c['iata'] == 'KUL')
        self.assertEqual((kl['aqi'], kl['tomorrowMax'], kl['dayAfterMax'], kl['price']), (169, 111, 90, None))
        self.assertEqual(result['cities'][0]['iata'], 'SIN')

    def test_bad_response_keeps_previous_file(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'escape.json'
            output.write_text('{"keep": true}')
            with patch.object(escape, 'OUTPUT', output), patch.object(escape, 'fetch', return_value=json.dumps(PAYLOAD[:3])):
                escape.main()
            self.assertEqual(json.loads(output.read_text()), {'keep': True})
        with self.assertRaises(ValueError):
            escape.build([location(None, {})] * len(escape.CITIES), NOW)


def trip(price, stops, url):
    return {'price': price, 'bookingUrl': url, 'totalDurationSeconds': 3600 * (2 + 3 * stops),
            'outbound': {'stops': stops, 'segments': [{'carrierName': 'AirAsia'}] * (stops + 1)}}


class FareTests(unittest.TestCase):
    def test_cheapest_and_cheapest_direct(self):
        search = {'currency': 'SGD', 'itineraries': [trip(233.4, 0, 'd1'), trip(211, 1, 'c1'), trip(250, 0, 'd2')]}
        fare = escape.cheapest(search, '2026-10-17', NOW)
        self.assertEqual((fare['amount'], fare['stops'], fare['url'], fare['hours']), (211, 1, 'c1', 5.0))
        self.assertEqual(fare['direct'], {'amount': 233, 'url': 'd1'})
        self.assertIsNone(escape.cheapest({'itineraries': []}, '2026-10-17', NOW)['amount'])

    def test_recent_fares_reused_and_failures_keep_same_day_fare(self):
        result = escape.build(PAYLOAD, NOW)
        recent = {'date': '2026-10-17', 'checkedAt': (NOW - dt.timedelta(hours=1)).isoformat(), 'amount': 99}
        stale = {'date': '2026-10-17', 'checkedAt': (NOW - dt.timedelta(hours=5)).isoformat(), 'amount': 88}
        previous = {'cities': [{'iata': 'KUL', 'price': recent}, {'iata': 'PEN', 'price': stale}]}
        calls = []

        def search(iata, date):
            calls.append(iata)
            if iata == 'PEN':
                raise OSError('offline')
            return {'currency': 'SGD', 'itineraries': [trip(150, 0, 'u')]}
        errors = escape.add_prices(result, previous, NOW, search=search, pause=0)
        by = {c['iata']: c['price'] for c in result['cities']}
        self.assertNotIn('KUL', calls)          # checked an hour ago: reused
        self.assertNotIn('SIN', calls)          # no flights from Singapore to itself
        self.assertEqual(by['KUL'], recent)
        self.assertEqual(by['PEN'], stale)      # refresh failed: keep the same-day fare
        self.assertEqual(errors, ['PEN: OSError'])
        self.assertEqual(by['BKK']['amount'], 150)
        self.assertEqual(len(calls), len(escape.CITIES) - 2)


if __name__ == '__main__':
    unittest.main()
