import datetime as dt
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('resources', Path(__file__).resolve().parents[1] / 'scripts/update_resources.py')
resources = importlib.util.module_from_spec(spec)
spec.loader.exec_module(resources)


def option(category, *on):
    names = {'stock': ['stocksAvailable', 'limitedStocksAvailable', 'outOfStock'], 'machine': ['available', 'notAvailable']}[category]
    return {'category': category, 'options': [{'name': n, 'flag': n in on} for n in names]}


MASKS = json.dumps({'lastUpdated': '16 Oct 2026', 'data': [
    {'name': 'Yishun SSO', 'address': '746 Yishun Street 72', 'postalCode': '760746', 'LAT': 1.4289, 'LON': 103.8335,
     'operatingHoursFreeText': 'Daily, 24 hours', 'description': 'Next to bicycle parking lot',
     'filters': [option('stock', 'limitedStocksAvailable'), option('machine', 'available')]},
    {'name': 'Broken', 'address': 'x', 'LAT': 1.3, 'LON': 103.8, 'filters': [option('stock', 'stocksAvailable'), option('machine', 'notAvailable')]},
    {'name': 'No stock flag', 'address': 'y', 'LAT': 1.31, 'LON': 103.81, 'filters': []},
    {'name': 'No coordinates', 'address': 'z', 'filters': []},
]})
GEOJSON = json.dumps({'features': [
    {'geometry': {'type': 'Point', 'coordinates': [103.79, 1.43]}, 'properties': {'NAME': 'ACE The Place CC', 'DESCRIPTION': 'CC', 'ADDRESSBLOCKHOUSENUMBER': '120', 'ADDRESSSTREETNAME': 'Woodlands Avenue 1', 'ADDRESSPOSTALCODE': '739069'}},
    {'geometry': {'type': 'Point', 'coordinates': [103.8, 1.3]}, 'properties': {'NAME': 'A WaVe outlet', 'DESCRIPTION': 'PAssion WaVe'}},
    {'geometry': {'type': 'Point', 'coordinates': [103.84, 1.37]}, 'properties': {'NAME': 'Ang Mo Kio Polyclinic', 'ADDRESSBLOCKHOUSENUMBER': 'None', 'ADDRESSSTREETNAME': 'Ang Mo Kio Central 2'}},
]})
MODIFIED = dt.datetime(2026, 10, 16, 12, 2, 51, tzinfo=dt.timezone.utc)


PURIFIER_PAGE = ('<table><tr><th>S/N</th><th>Brand and Model</th><th>Category</th><th>Filter Grade</th><th>A</th><th>B</th></tr>'
                 '<tr><td>1</td><td>Airify AP1402</td><td>Mechanical</td><td>HEPA</td><td>176</td><td>176</td></tr></table>')


def fake_fetch(url):
    if url == resources.MASKS:
        return MASKS, MODIFIED
    if url == resources.PURIFIERS:
        return PURIFIER_PAGE, None
    if 'poll-download' in url:
        return json.dumps({'data': {'url': 'https://example.invalid/file.geojson'}}), None
    return GEOJSON, None


class ResourceTests(unittest.TestCase):
    def test_mask_points_keep_stock_and_machine_status(self):
        masks = resources.mask_points(*fake_fetch(resources.MASKS))
        self.assertEqual(masks['updatedAt'], '2026-10-16T20:02:51+08:00')
        by_name = {m['name']: m for m in masks['items']}
        self.assertNotIn('No coordinates', by_name)
        self.assertEqual(by_name['Yishun SSO']['stock'], 'limited')
        self.assertFalse(by_name['Broken']['working'])
        self.assertEqual(by_name['No stock flag']['stock'], 'unknown')

    def test_static_layers_filtered_and_addresses_cleaned(self):
        with patch.object(resources, 'fetch', side_effect=fake_fetch):
            ccs = resources.dataset_points('cc', lambda p: p.get('DESCRIPTION') == 'CC')
            clinics = resources.dataset_points('poly', lambda p: 'polyclinic' in p['NAME'].lower())
        self.assertEqual([c['name'] for c in ccs], ['ACE The Place CC'])
        self.assertEqual((ccs[0]['address'], ccs[0]['lat'], ccs[0]['lon']), ('120 Woodlands Avenue 1', 1.43, 103.79))
        self.assertEqual(clinics[0]['address'], 'Ang Mo Kio Central 2')

    def test_unchanged_data_is_not_rewritten_and_failures_keep_last_copy(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'resources.json'
            with patch.object(resources, 'OUTPUT', output), patch.object(resources, 'ROOT', Path(directory)), patch.object(resources, 'fetch', side_effect=fake_fetch):
                resources.main()
                first = output.read_text()
                resources.main()
                self.assertEqual(output.read_text(), first)
            with patch.object(resources, 'OUTPUT', output), patch.object(resources, 'ROOT', Path(directory)), patch.object(resources, 'fetch', side_effect=OSError('offline')):
                resources.main()
            saved = json.loads(output.read_text())
            self.assertEqual(len(saved['masks']['items']), 3)
            self.assertEqual(saved['errors'], ['masks: OSError'])  # static lists were fetched within the last week

    def test_nea_air_cleaner_table(self):
        page = ('<p>Last updated on 30 Dec 2024</p><table><tr><td>Disclaimer</td></tr></table>'
                '<table><tr><th>S/N</th><th>Brand and Model</th><th>Category</th><th>Filter Grade</th>'
                '<th>Smoke CADR in CMH (Filtration Alone)</th><th>Smoke CADR in CMH (Overall)</th></tr>'
                '<tr><td>1</td><td>Airify <b>AP1402</b></td><td>Mechanical</td><td>HEPA</td><td>176</td><td>176</td></tr>'
                '<tr><td>2</td><td>Novita A8i</td><td>Mechanical and Electronic</td><td>HEPA</td><td>N.A.</td><td>847</td></tr>'
                '<tr><td>3</td><td>Broken</td><td>Mechanical</td><td>HEPA</td><td>-</td><td>-</td></tr></table>')
        result = resources.purifier_list(page)
        self.assertEqual(result['listUpdated'], '2024-12-30')
        self.assertEqual(result['items'], [
            {'model': 'Airify AP1402', 'electronic': False, 'filter': 'HEPA', 'cadrFilter': 176, 'cadrOverall': 176},
            {'model': 'Novita A8i', 'electronic': True, 'filter': 'HEPA', 'cadrFilter': None, 'cadrOverall': 847}])
        with self.assertRaises(ValueError):
            resources.purifier_list('<table></table>')


if __name__ == '__main__':
    unittest.main()
