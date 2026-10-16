import datetime as dt
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('updater', Path(__file__).resolve().parents[1] / 'scripts/update_data.py')
updater = importlib.util.module_from_spec(spec)
spec.loader.exec_module(updater)


class UpdaterTests(unittest.TestCase):
    def test_incomplete_or_non_numeric_air_data_rejected(self):
        item = {'timestamp': '2026-10-16T09:00:00+08:00', 'readings': {'psi_twenty_four_hourly': {r: 120 for r in updater.REGIONS}}}
        self.assertEqual(updater.validate_reading(item, 'psi_twenty_four_hourly'), item)
        item['readings']['psi_twenty_four_hourly']['central'] = True
        with self.assertRaises(ValueError):
            updater.validate_reading(item, 'psi_twenty_four_hourly')

    def test_official_history_pagination(self):
        with patch.object(updater, 'fetch', side_effect=[json.dumps({'code': 0, 'data': {'items': [1], 'paginationToken': 'next'}}), json.dumps({'code': 0, 'data': {'items': [2]}})]) as fetch:
            self.assertEqual(updater.api_items('psi', '2026-10-15'), [1, 2])
            self.assertIn('paginationToken=next', fetch.call_args[0][0])

    def test_government_announcements_preserve_source_url_and_title(self):
        payload = {'Data': [{'Title': 'Haze Situation Update', 'NewsOrAdvisory': 'Advisory', 'UrlName': 'haze-update', 'DateOfArticleStr': '15 Oct 2026'}, {'Title': 'Other news'}]}
        with patch.object(updater, 'fetch', return_value=json.dumps(payload)):
            items = updater.government_news()
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]['url'], 'https://www.nea.gov.sg/media/news/advisories/index/haze-update')

    def test_failed_upstream_retains_last_valid_reading_and_reports_failure(self):
        now = dt.datetime.now(updater.SGT).isoformat()
        previous = {'psi': {'timestamp': now, 'readings': {'psi_twenty_four_hourly': {r: 120 for r in updater.REGIONS}}}, 'pm25': {'timestamp': now, 'readings': {'pm25_one_hourly': {r: 80 for r in updater.REGIONS}}}, 'news': [], 'advisories': [], 'history': {}}
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / 'latest.json'
            output.write_text(json.dumps(previous))
            with patch.object(updater, 'ROOT', root), patch.object(updater, 'OUTPUT', output), patch.object(updater, 'fetch', side_effect=OSError('offline')):
                with self.assertRaises(SystemExit):
                    updater.main()
            saved = json.loads(output.read_text())
            self.assertEqual(saved['psi'], previous['psi'])
            self.assertFalse(saved['sources']['psi']['ok'])
            self.assertFalse(output.with_suffix('.tmp').exists())


if __name__ == '__main__':
    unittest.main()
