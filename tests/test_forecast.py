import datetime as dt
import importlib.util
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
spec = importlib.util.spec_from_file_location('forecast', Path(__file__).resolve().parents[1] / 'scripts/forecast.py')
forecast = importlib.util.module_from_spec(spec)
spec.loader.exec_module(forecast)

SGT = forecast.SGT
NOW = dt.datetime(2026, 10, 16, 19, 5, tzinfo=SGT)
NEA_PAGE = ('<div>Haze Situation Update (16 October 2026) 16 Oct 2026 Share Air Quality Forecast '
            '24-hr PSI Forecast: <b>Unhealthy to Low Very Unhealthy</b> Health Advisory Healthy persons ... '
            'Singapore, 16 October 2026 – The 24-hr PSI forecast for 17 Oct 2026 is Unhealthy to Low Very Unhealthy . '
            'Update on Hotspot and Haze Situation 2. Smoke drifted. 3. Tomorrow, winds will be southeasterly. '
            '4. Over the weekend, showers. Activity Guidelines 5. ...</div>')
ADVISORIES = [{'title': 'Haze Situation Update (16 October 2026)', 'url': 'https://www.nea.gov.sg/media/news/advisories/index/x',
               'publishedAt': '2026-10-16T18:19:00+08:00'}]


def history(kind, value, hours=72):
    return [{'timestamp': (NOW.replace(minute=0) - dt.timedelta(hours=h)).isoformat(),
             'values': {r: value for r in forecast.REGIONS}} for h in range(hours)]


def snapshot(psi=150):
    return {'psi': {'timestamp': NOW.replace(minute=0).isoformat(),
                    'readings': {'psi_twenty_four_hourly': {r: psi for r in forecast.REGIONS}}},
            'advisories': ADVISORIES, 'history': {'psi': history('psi', psi - 20), 'pm25': history('pm25', 80)}}


def cams(value=40):
    times = [(NOW.replace(hour=0, minute=0) + dt.timedelta(hours=h - 48)).strftime('%Y-%m-%dT%H:%M') for h in range(120)]
    return json.dumps([{'hourly': {'time': times, 'pm2_5': [value] * len(times)}} for _ in forecast.REGIONS])


OUTLOOK = json.dumps({'data': {'records': [{'forecasts': [{'timestamp': '2026-10-17T00:00:00+08:00',
                      'forecast': {'summary': 'Afternoon thundery showers'}, 'wind': {'direction': 'SSE', 'speed': {'low': 5, 'high': 15}}}]}]}})


SUBSEASONAL = 'https://asmc.asean.org/subseasonal-weather-outlook-12-25-october-2026/'
ASMC_HOME = ('<p>With the activation of Alert Level 3, the regional haze situation is updated twice a day.</p>'
             '<h3>Seasonal Forecast for October &#8211; December 2026</h3><h4>Summary of Outlook</h4>'
             '<p>In September 2026, Southwest Monsoon conditions prevailed.</p>'
             '<p>Under El Niño conditions, the hotspot and smoke haze situation is expected to remain escalated. '
             'Increased showers under the inter-monsoon conditions towards the end of October could start to alleviate it.</p>'
             f'<p><a href="https://asmc.asean.org/asmc-seasonal-outlook/">Click here for details</a></p><a href="{SUBSEASONAL}">x</a>')
ASMC_SUB = ('<title>Subseasonal Weather Outlook (12 – 25 October 2026) - ASMC</title>'
            '<p>Drier than usual conditions are predicted over most of the southern ASEAN region in the next fortnight (12 – 25 October). '
            'Drier than usual conditions are also predicted for northern Mainland Southeast Asia in Week 1.</p>')


def fake_fetch(url):
    if url.startswith(forecast.CAMS):
        return cams()
    if url == forecast.OUTLOOK:
        return OUTLOOK
    if url == forecast.ASMC:
        return ASMC_HOME
    if url == SUBSEASONAL:
        return ASMC_SUB
    return NEA_PAGE


class ForecastTests(unittest.TestCase):
    def test_nea_band_text_maps_to_psi_range(self):
        self.assertEqual(forecast.band_range('Unhealthy'), (101, 200))
        self.assertEqual(forecast.band_range('Unhealthy to Low Very Unhealthy'), (101, 234))
        self.assertEqual(forecast.band_range('High Moderate'), (84, 100))
        self.assertIsNone(forecast.band_range('Not a band'))

    def test_pm25_sub_index_breakpoints(self):
        self.assertEqual(forecast.psi_from_pm25(12), 50)
        self.assertEqual(forecast.psi_from_pm25(55), 100)
        self.assertEqual(forecast.psi_from_pm25(150), 200)
        self.assertEqual(forecast.psi_from_pm25(1000), 500)

    def test_official_forecast_parsed_from_haze_update(self):
        official = forecast.official_forecast(lambda url: NEA_PAGE, ADVISORIES)
        self.assertEqual((official['low'], official['high'], official['forDate']), (101, 234, '2026-10-17'))
        self.assertEqual(official['outlook'], 'Tomorrow, winds will be southeasterly.')

    def test_numeric_forecast_format_from_16_october(self):
        page = ('<p>Air Quality Forecast PSI Forecast: 150 - 230 Unhealthy to Very Unhealthy Health Advisory Healthy persons ... '
                'Singapore, 16 October 2026 – The PSI forecast for 17 Oct 2026 is 150 – 230 (Unhealthy to Very Unhealthy) . '
                '2. The PSI forecast and corresponding health advisories should be used for planning next day outdoor activities. '
                '3. For immediate outdoor activities, please check the 1-hr PM2.5 readings. Update on Hotspot and Haze Situation '
                '4. Showers fell over a few parts of Singapore. 5. For tomorrow, winds will shift to blow from the south. '
                '6. On Sunday, showers are forecast. Activity Guidelines 7. The health impact ...</p>')
        official = forecast.official_forecast(lambda url: page, ADVISORIES)
        self.assertEqual((official['low'], official['high'], official['forDate']), (150, 230, '2026-10-17'))
        self.assertEqual(official['text'], '150–230 Unhealthy to Very Unhealthy')
        self.assertEqual(official['outlook'], 'For tomorrow, winds will shift to blow from the south.')

    def test_model_is_bias_corrected_against_nea_readings(self):
        # NEA read 80 µg/m³ while the model said 40, so tomorrow's 40 is scaled to 80.
        model = forecast.model_forecast(lambda url: cams(40), NOW.date() + dt.timedelta(days=1), history('pm25', 80), NOW)
        self.assertEqual(model['central']['bias'], 2.0)
        self.assertEqual(model['central']['pm25'], 80.0)
        self.assertEqual(model['central']['psi'], round(forecast.psi_from_pm25(80)))
        # Hourly values start after the current hour and stop at the end of the target day.
        hours = sorted(model['central']['hourly'])
        self.assertEqual((hours[0], hours[-1]), ('2026-10-16T20', '2026-10-17T23'))
        self.assertEqual(set(model['central']['hourly'].values()), {80})

    def test_blend_weights_official_forecast_and_reports_confidence(self):
        result, statuses, errors = forecast.build(fake_fetch, snapshot(), NOW)
        self.assertEqual(errors, [])
        self.assertTrue(all(s['ok'] for s in statuses.values()))
        self.assertEqual(result['targetDate'], '2026-10-17')
        self.assertEqual(result['official']['text'], 'Unhealthy to Low Very Unhealthy')
        self.assertTrue(result['weather']['rain'] and result['weather']['southerly'])
        self.assertLessEqual(result['psi']['low'], result['psi']['high'])
        self.assertEqual(result['confidence'], 'high')
        self.assertEqual(set(result['regions']), set(forecast.REGIONS))
        self.assertEqual(set(result['hourly']['regions']), set(forecast.REGIONS))
        self.assertEqual(len(result['hourly']['times']), len(result['hourly']['regions']['north']))

    def test_long_range_days_and_when_it_improves(self):
        result, _, _ = forecast.build(fake_fetch, snapshot(), NOW)
        long = result['longRange']
        # Tomorrow comes from the blend; the day after from the bias-corrected model (CAMS 40 × 2 = 80 µg/m³).
        self.assertEqual([d['source'] for d in long['days']], ['blend', 'model'])
        self.assertEqual(long['days'][1]['date'], '2026-10-18')
        self.assertEqual(long['days'][1]['high'], round(forecast.psi_from_pm25(80)))
        self.assertEqual(long['days'][0]['weather']['windDirection'], 'SSE')
        self.assertIsNone(long['betterFrom'])  # PSI ~150 throughout
        days = forecast.long_range(NOW.date(), {'low': 120, 'high': 140}, {'north': {'days': {'2026-10-17': 90}}}, None, None)
        self.assertEqual(days['betterFrom'], '2026-10-17')

    def test_asmc_outlooks_parsed_and_cached(self):
        asmc = forecast.asmc_outlook(fake_fetch, NOW)
        self.assertTrue(asmc['seasonal']['text'].startswith('Under El Niño'))
        self.assertEqual(asmc['seasonal']['title'], 'Seasonal Forecast for October – December 2026')
        self.assertTrue(asmc['seasonal']['escalated'])
        self.assertEqual(asmc['seasonal']['easeFrom'], {'part': 'end', 'month': 10, 'rain': True})
        self.assertEqual(forecast.easing('Haze is expected to ease by the middle of November.')['easeFrom']['part'], 'middle')
        self.assertNotIn('easeFrom', forecast.easing('Haze may rise towards the end of the year.'))
        self.assertEqual(asmc['fortnight']['tendency'], 'drier')
        self.assertEqual(asmc['fortnight']['until'], '2026-10-25')
        self.assertIn('next fortnight', asmc['fortnight']['text'])
        # A recent copy is reused rather than fetched again every hour.
        calls = []
        cached = {**snapshot(), 'forecast': {'longRange': {'asmc': asmc}}}
        result, statuses, _ = forecast.build(lambda url: calls.append(url) or fake_fetch(url), cached, NOW + dt.timedelta(hours=1))
        self.assertNotIn(forecast.ASMC, calls)
        self.assertNotIn('forecast_asmc', statuses)
        self.assertEqual(result['longRange']['asmc'], asmc)

    def test_stale_official_forecast_ignored_and_failures_degrade(self):
        def fetch(url):
            if url.startswith(forecast.CAMS):
                raise OSError('offline')
            return fake_fetch(url)
        later = NOW + dt.timedelta(days=1)  # The 16 Oct update covers 17 Oct, not 18 Oct.
        result, statuses, errors = forecast.build(fetch, snapshot(), later)
        self.assertIsNone(result['official'])
        self.assertIsNone(result['model'])
        self.assertFalse(statuses['forecast_model']['ok'])
        self.assertEqual(result['confidence'], 'low')
        self.assertIn('forecast_model: OSError', errors)

    def test_log_keeps_last_issue_per_day_and_scores_finished_days(self):
        first = {'targetDate': '2026-10-15', 'issuedAt': 'a', 'psi': {'low': 100, 'high': 150}}
        log = forecast.update_log([], first, [], NOW - dt.timedelta(days=2))
        readings = [{'timestamp': f'2026-10-15T{h:02d}:00:00+08:00', 'values': {'north': 120, 'central': 160}} for h in range(24)]
        log = forecast.update_log(log, None, readings, NOW)
        self.assertEqual((log[0]['actualLow'], log[0]['actualHigh'], log[0]['hit']), (120, 160, True))
        self.assertEqual(len(forecast.update_log([{'targetDate': f'2026-09-{d:02d}'} for d in range(1, 30)], None, [], NOW)), forecast.LOG_DAYS)


if __name__ == '__main__':
    unittest.main()
