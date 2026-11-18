"""Offline tests for mri_sync.sync_cloud_files (the cloud-only MRI files, WO_MP2).

The fetch is always injected or patched, so none of these tests makes a network call. Source and destination are
temporary folders; the real public/data/mri/ is never touched.
"""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import mri_sync

BASE = "https://example.invalid/data"


def doc(**kw):
    return json.dumps(kw).encode("utf-8")


# One small valid document per remote file, each carrying the date key mri_sync reads for it.
REMOTE = {
    "data_health.json": doc(generated_at="2026-11-18T04:22:51+00:00"),
    "history_index.json": doc(generated_at="2026-11-18T04:22:51+00:00", runs=[]),
    "nber_benchmark.json": doc(generated_at="2026-11-17T04:22:27+00:00", status="ok"),
    "news_score_report.json": doc(latest_news_scoring_date="2026-11-18"),
    "news_monitoring_report.json": doc(overlay_monitoring={"diagnostic_date": "2026-11-18T00:00:00"}),
    "news_accumulation_report.json": doc(latest_run={"run_date": "2026-11-18T00:00:00"}),
    "combined_sector_diagnostic.json": doc(diagnostic_date="2026-11-18"),
    "news_sources.json": doc(generated_at="2026-11-18T04:22:16+00:00", groups=[]),
    "daily_diagnostic_summary.json": doc(run_date="2026-11-18", news_health={}),
    "manifest.json": doc(generated_at="2026-11-18T04:22:51+00:00", data_status="complete"),
}


class TestCloudSync(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.snapshot = Path(temp.name) / "snapshot"
        self.manifest_path = self.snapshot / "manifest.json"
        for item in (
            patch.object(mri_sync, "SNAPSHOT_DIR", self.snapshot),
            patch.object(mri_sync, "MANIFEST_JSON", self.manifest_path),
        ):
            item.start()
            self.addCleanup(item.stop)
        self.requested = []

    def fetch(self, missing=(), override=None):
        remote = {**REMOTE, **(override or {})}

        def run(url):
            self.requested.append(url)
            name = url.rsplit("/", 1)[1]
            if name in missing or name not in remote:
                raise OSError("HTTP Error 404: Not Found")
            return remote[name]

        return run

    def manifest(self):
        return json.loads(self.manifest_path.read_text(encoding="utf-8"))

    def test_fetches_every_file_and_records_each_own_date(self):
        result = mri_sync.sync_cloud_files(fetch=self.fetch(), base_url=BASE + "/")
        self.assertEqual(result["skipped"], {})
        self.assertEqual(set(result["fetched"]), set(mri_sync.CLOUD_FILES))
        self.assertEqual((self.snapshot / "news_score_report.json").read_bytes(), REMOTE["news_score_report.json"])
        # a cloud file that shares a name with a local one is stored under its own name
        self.assertEqual((self.snapshot / "cloud_daily_diagnostic_summary.json").read_bytes(), REMOTE["daily_diagnostic_summary.json"])
        self.assertFalse((self.snapshot / "daily_diagnostic_summary.json").exists())
        files = self.manifest()["cloud_files"]
        self.assertEqual(files["nber_benchmark.json"]["date"], "2026-11-17")
        self.assertEqual(files["news_monitoring_report.json"]["date"], "2026-11-18")
        self.assertEqual(files["news_accumulation_report.json"]["date"], "2026-11-18")
        self.assertEqual(files["data_health.json"]["bytes"], len(REMOTE["data_health.json"]))
        self.assertEqual(self.manifest()["cloud_source"], BASE)
        self.assertTrue(all(url.startswith(BASE + "/") and "//data" not in url[len(BASE):] for url in self.requested))

    def test_unavailable_file_is_skipped_and_reported_and_the_rest_arrive(self):
        result = mri_sync.sync_cloud_files(fetch=self.fetch(missing=("nber_benchmark.json",)), base_url=BASE)
        self.assertIn("nber_benchmark.json", result["skipped"])
        self.assertIn("404", result["skipped"]["nber_benchmark.json"])
        self.assertEqual(len(result["fetched"]), len(mri_sync.CLOUD_FILES) - 1)
        self.assertFalse((self.snapshot / "nber_benchmark.json").exists())
        self.assertNotIn("nber_benchmark.json", self.manifest()["cloud_files"])

    def test_bad_content_is_skipped(self):
        bad = {
            "data_health.json": b"not json at all",
            "history_index.json": b"[1, 2, 3]",
            "news_sources.json": b"x" * (mri_sync.MAX_CLOUD_BYTES + 1),
            "nber_benchmark.json": b"\xff\xfe",
        }
        result = mri_sync.sync_cloud_files(fetch=self.fetch(override=bad), base_url=BASE)
        self.assertEqual(set(result["skipped"]), set(bad))
        for name in bad:
            self.assertFalse((self.snapshot / name).exists(), name)

    def test_a_skipped_file_keeps_its_earlier_copy_and_earlier_date(self):
        mri_sync.sync_cloud_files(fetch=self.fetch(), base_url=BASE)
        before = (self.snapshot / "data_health.json").read_bytes()
        result = mri_sync.sync_cloud_files(fetch=self.fetch(missing=("data_health.json",)), base_url=BASE)
        self.assertIn("data_health.json", result["skipped"])
        self.assertEqual((self.snapshot / "data_health.json").read_bytes(), before)
        self.assertEqual(self.manifest()["cloud_files"]["data_health.json"]["date"], "2026-11-18")

    def test_a_missing_date_is_null_not_invented(self):
        result = mri_sync.sync_cloud_files(
            fetch=self.fetch(override={"data_health.json": doc(reading_date="2026-11-01")}), base_url=BASE
        )
        self.assertIsNone(result["fetched"]["data_health.json"]["date"])

    def test_local_files_keep_priority(self):
        self.snapshot.mkdir()
        local = self.snapshot / "daily_diagnostic_summary.json"
        local.write_bytes(b'{"run_date": "local"}')
        self.manifest_path.write_text(json.dumps({"files": {"daily_diagnostic_summary.json": {}}}), encoding="utf-8")
        # Even if a cloud entry were pointed at a name the local run owns, it is never fetched or written.
        table = {**mri_sync.CLOUD_FILES, "daily_diagnostic_summary.json": ("daily_diagnostic_summary.json", ("run_date",))}
        with patch.object(mri_sync, "CLOUD_FILES", table):
            result = mri_sync.sync_cloud_files(fetch=self.fetch(), base_url=BASE)
        self.assertIn("the local sync owns this name", result["skipped"]["daily_diagnostic_summary.json"])
        self.assertEqual(local.read_bytes(), b'{"run_date": "local"}')
        self.assertIn("files", self.manifest())   # the local part of the manifest is left as it was

    def test_the_local_sync_keeps_what_the_cloud_step_recorded(self):
        mri_sync.sync_cloud_files(fetch=self.fetch(), base_url=BASE)
        source = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: [p.unlink() for p in source.iterdir()] or source.rmdir())
        (source / "current_regime.json").write_bytes(b'{"date": "2026-11-18"}')
        with patch.object(mri_sync, "SNAPSHOT_FILES", ("current_regime.json",)), \
                patch.object(mri_sync.peer_paths, "mri_outputs_dir", return_value=source):
            mri_sync.sync_mri_snapshot()
        manifest = self.manifest()
        self.assertEqual(manifest["files"]["current_regime.json"]["mri_date"], "2026-11-18")
        self.assertEqual(len(manifest["cloud_files"]), len(mri_sync.CLOUD_FILES))

    def test_the_request_carries_only_a_generic_client_name(self):
        seen = []

        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def read(self, n=-1):
                return b"{}"

        def fake_urlopen(request, timeout=None):
            seen.append(request)
            return Response()

        with patch.object(mri_sync.urllib.request, "urlopen", fake_urlopen):
            self.assertEqual(mri_sync._http_get(BASE + "/x.json"), b"{}")
        self.assertEqual(seen[0].full_url, BASE + "/x.json")
        self.assertEqual(dict(seen[0].header_items()), {"User-agent": mri_sync.CLOUD_CLIENT_NAME})
        self.assertIsNone(seen[0].data)

    def test_a_non_https_address_is_refused(self):
        with self.assertRaises(ValueError):
            mri_sync._http_get("file:///etc/passwd")
        with self.assertRaises(ValueError):
            mri_sync._http_get("http://example.invalid/x.json")

    def test_the_cloud_base_url_comes_from_one_variable_with_a_public_default(self):
        from peer_paths import mri_cloud_data_url
        with patch.dict("os.environ", {"MRI_CLOUD_DATA_URL": ""}):
            self.assertTrue(mri_cloud_data_url().startswith("https://raw.githubusercontent.com/"))
            self.assertTrue(mri_cloud_data_url().endswith("/gh-pages/data"))
        with patch.dict("os.environ", {"MRI_CLOUD_DATA_URL": " https://mirror.invalid/d/ "}):
            self.assertEqual(mri_cloud_data_url(), "https://mirror.invalid/d")


if __name__ == "__main__":
    unittest.main()
