import datetime as dt
import importlib.util
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
spec = importlib.util.spec_from_file_location('history', Path(__file__).resolve().parents[1] / 'scripts/update_history.py')
history = importlib.util.module_from_spec(spec)
spec.loader.exec_module(history)

CSV = '''24hr_psi,north,south,east,west,central
24/9/2015 23:00,250,301,260,270,280
25/9/2015 8:00,290,322,267,300,309
2016-04-04 010:00:00,55,53,52,55,53
4/4/2016 1:00,54,,50,55,52
bad row,1,2,3,4,5
'''


class HistoryTests(unittest.TestCase):
    def test_dataset_rows_including_the_malformed_2016_one(self):
        daily, end = history.parse_csv(CSV)
        self.assertEqual(daily['2015-09-24'], [301, 'south'])
        self.assertEqual(daily['2015-09-25'], [322, 'south'])
        self.assertEqual(daily['2016-04-04'], [55, 'north'])  # blank south cell skipped
        self.assertEqual(end, '2016-04-04')
        self.assertEqual(history.parse_time('2016-04-04 010:00:00'), dt.datetime(2016, 4, 4, 10, 0))

    def test_merge_keeps_the_day_maximum(self):
        daily = {}
        history.merge(daily, '2026-10-16', {'north': 150, 'central': 229})
        history.merge(daily, '2026-10-16', {'north': 160, 'central': 200})
        history.merge(daily, '2026-10-16', {'north': True})
        self.assertEqual(daily['2026-10-16'], [229, 'central'])

    def test_year_summary_and_season(self):
        daily = {'2015-09-24': [301, 'south'], '2015-09-25': [322, 'south'], '2015-10-01': [150, 'west'],
                 '2026-10-14': [205, 'west'], '2026-10-16': [229, 'central'], '2026-09-02': [None, None]}
        years, season = history.summarise(daily, dt.date(2026, 10, 16))
        y2015, y2026 = years
        self.assertEqual((y2015['peak'], y2015['peakDate'], y2015['days100'], y2015['days200'], y2015['days300']), (322, '2015-09-25', 3, 2, 2))  # 301 is already Hazardous
        self.assertEqual((y2026['peak'], y2026['peakRegion'], y2026['days200'], y2026['partial']), (229, 'central', 2, True))
        self.assertEqual(len(season[2015]), 122)  # 1 Aug - 30 Nov
        self.assertEqual(season[2015][55], 322)   # 25 Sep is day 55 of the season
        self.assertNotIn(2019, season)            # no data, no line


if __name__ == '__main__':
    unittest.main()
