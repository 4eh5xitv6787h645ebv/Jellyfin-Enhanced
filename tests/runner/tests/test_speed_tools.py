"""The test-speed tooling must never lose a test, double a test, or select less than a change can reach."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[3]


def load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'tests/runner' / f'{name}.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


shards = load('dotnet_shards')
affected = load('affected')
NS = 'http://microsoft.com/schemas/VisualStudio/TeamTest/2010'


def trx(path, results):
    rows = ''.join(f'<UnitTestResult testId="{i}" testName="{name}" outcome="{outcome}" duration="00:00:00.0100000"/>'
                   for i, (name, outcome) in enumerate(results))
    defs = ''.join(f'<UnitTest id="{i}"><TestMethod className="{name.rsplit(".", 1)[0]}"/></UnitTest>' for i, (name, _) in enumerate(results))
    passed = sum(1 for _, o in results if o == 'Passed')
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f'<TestRun xmlns="{NS}"><Results>{rows}</Results><TestDefinitions>{defs}</TestDefinitions>'
                    f'<ResultSummary><Counters total="{len(results)}" passed="{passed}"/></ResultSummary></TestRun>')


def coverage(path, lines, branches):
    path.mkdir(parents=True, exist_ok=True)
    (path / 'coverage.json').write_text(json.dumps({'Jellyfin.Plugin.JellyfinEnhanced.dll': {'/src/A.cs': {'A': {'M': {
        'Lines': {str(k): v for k, v in lines.items()},
        'Branches': [{'Line': 1, 'Offset': o, 'EndOffset': o + 1, 'Path': p, 'Ordinal': p, 'Hits': h} for (o, p), h in branches.items()]}}}}}))


class DotnetShardsTests(unittest.TestCase):
    def test_the_real_tree_has_no_unplaceable_singleton_attribute(self):
        singles, classes, problems = shards.scan()
        self.assertEqual([], problems)
        self.assertGreater(len(singles), 0)
        self.assertTrue(set(singles) <= set(classes))

    def test_singleton_shards_partition_the_singleton_classes_and_the_parallel_filter_excludes_all_of_them(self):
        singles, _, _ = shards.scan()
        with mock.patch('builtins.print') as out:
            self.assertEqual(0, shards.plan(3, None))
        plan = json.loads(out.call_args[0][0])
        placed = [c for name, f in plan.items() if name.startswith('singleton-') for c in
                  (part.removeprefix('FullyQualifiedName~').removesuffix('.') for part in f.split('|'))]
        self.assertEqual(sorted(singles), sorted(placed), 'every singleton class in exactly one shard')
        self.assertEqual(len(placed), len(set(placed)))
        excluded = [part.removeprefix('FullyQualifiedName!~').removesuffix('.') for part in plan['parallel'].split('&')]
        self.assertEqual(sorted(singles), sorted(excluded))

    def test_merge_adds_counts_refuses_a_test_in_two_shards_and_unions_coverage_exactly(self):
        with tempfile.TemporaryDirectory() as d:
            res = Path(d)
            trx(res / 'a' / 'a.trx', [('N.C.t1', 'Passed'), ('N.C.t2', 'Failed')])
            trx(res / 'b' / 'b.trx', [('N.D.t3', 'Passed')])
            coverage(res / 'a' / 'g1', {1: 1, 2: 0, 3: 0}, {(0, 0): 1, (0, 1): 0})
            coverage(res / 'b' / 'g2', {1: 0, 2: 2, 3: 0}, {(0, 0): 0, (0, 1): 3})
            with mock.patch('builtins.print') as out:
                shards.merge(res, ['a', 'b'])
            lines = [c[0] for c in out.call_args_list if c[0]]
            self.assertEqual((3, 2), lines[0])
            xml = (res / 'merged/coverage.cobertura.xml').read_text()
            self.assertIn('line-rate="0.6666666666666666"', xml)     # lines 1 and 2 of 3 covered by one shard or the other
            self.assertIn('branch-rate="1.0"', xml)                  # each branch path covered by one shard
            trx(res / 'b' / 'b.trx', [('N.C.t1', 'Passed')])
            with self.assertRaises(SystemExit):
                shards.merge(res, ['a', 'b'])


class AffectedTests(unittest.TestCase):
    def test_trace_parsing_keeps_reads_listings_and_misses_inside_the_checkout_only(self):
        root = affected.ROOT
        text = '\n'.join([
            f'1 openat(AT_FDCWD<{root}>, "package.json", O_RDONLY|O_CLOEXEC) = 20<{root}/package.json>',
            f'1 openat(AT_FDCWD<{root}>, "client/entries", O_RDONLY|O_DIRECTORY) = 21<{root}/client/entries>',
            f'1 newfstatat(AT_FDCWD<{root}>, "client/src/nope.ts", 0x7ffd, 0) = -1 ENOENT (No such file or directory)',
            '1 openat(AT_FDCWD</>, "/etc/hosts", O_RDONLY) = 3</etc/hosts>',
            f'2 openat(AT_FDCWD<{root}>, "client/src/a.ts", O_RDONLY <unfinished ...>',
            '2 <... openat resumed>) = 22',
            f'1 openat(AT_FDCWD<{root}>, "node_modules/x/index.js", O_RDONLY) = 23',
        ])
        reads, dirs, missing = affected.parse_trace(text, root)
        self.assertEqual(['client/src/a.ts', 'package.json'], reads)
        self.assertEqual(['client/entries'], dirs)
        self.assertEqual(['client/src/nope.ts'], missing)

    def selection(self, changed, suites=None, node=None, lock=None):
        files = {'frontend': ['tests/frontend/a.test.mjs', 'tests/frontend/b.test.mjs'], 'client-build': [], 'boundary': [],
                 'browser': ['tests/browser/x.spec.cjs'], 'dotnet': ['tests/backend/JE.Tests.csproj']}
        entry = lambda reads=(), dirs=(), missing=(): {'rc': 0, 'reads': list(reads), 'dirs': list(dirs), 'missing': list(missing)}
        data = {'commit': 'c0ffee', 'node': node or affected.node_version(), 'lock': lock or affected.lock_hash(), 'suites': suites or {
            'frontend': {'tests/frontend/a.test.mjs': entry(['js/a.js'], ['Configuration/admin'], ['js/missing.js']),
                         'tests/frontend/b.test.mjs': entry(['js/b.js'])},
            'browser': {'tests/browser/x.spec.cjs': entry(['js/a.js'])}, 'dotnet': {'tests/backend/JE.Tests.csproj': entry(['docs/feature-map.json'])}}}
        with tempfile.TemporaryDirectory() as d, mock.patch.object(affected, 'suite_files', lambda s: files[s]):
            path = Path(d) / 'map.json'
            path.write_text(json.dumps(data))
            return affected.select(path, changed=changed)

    def test_a_change_selects_exactly_the_files_that_read_it(self):
        s = self.selection({'js/a.js': 'M'})
        self.assertIsNone(s['all'])
        self.assertEqual(['tests/frontend/a.test.mjs'], s['suites'].get('frontend'))
        self.assertEqual(['tests/browser/x.spec.cjs'], s['suites'].get('browser'))
        self.assertNotIn('dotnet', s['suites'])

    def test_a_new_file_where_a_test_looked_or_in_a_directory_it_listed_selects_it(self):
        self.assertEqual(['tests/frontend/a.test.mjs'], self.selection({'js/missing.js': 'A'})['suites'].get('frontend'))
        self.assertEqual(['tests/frontend/a.test.mjs'], self.selection({'Configuration/admin/new.js': 'A'})['suites'].get('frontend'))

    def test_plugin_changes_and_runtime_reads_select_the_dotnet_suite(self):
        self.assertIn('dotnet', self.selection({'Jellyfin.Plugin.JellyfinEnhanced/Features/X.cs': 'M'})['suites'])
        self.assertIn('dotnet', self.selection({'docs/feature-map.json': 'M'})['suites'])

    def test_unknown_state_selects_everything(self):
        self.assertIsNotNone(self.selection({'package-lock.json': 'M'})['all'])
        self.assertIsNotNone(self.selection({}, node='v0.0.0')['all'])
        self.assertIsNotNone(self.selection({}, lock='other')['all'])
        s = self.selection({}, suites={'frontend': {}})      # files the map does not know are selected
        self.assertEqual(['tests/frontend/a.test.mjs', 'tests/frontend/b.test.mjs'], s['suites']['frontend'])


if __name__ == '__main__':
    unittest.main()
