"""Offline MRI snapshot read-once/custody regression tests.

Every test patches the source and destination to temporary paths. Do not run
scripts/mri_sync.py directly as part of this suite.
"""
import json
import tempfile
import unittest
from hashlib import sha256
from pathlib import Path
from unittest.mock import patch

import mri_sync


class TestMRISnapshotReadOnce(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        self.originals = root / "source"
        self.originals.mkdir()
        self.snapshot = root / "snapshot"
        self.manifest_path = self.snapshot / "manifest.json"
        self.files = ("current_regime.json", "shock_register.json", "event_register_run.json")
        patches = (
            patch.object(mri_sync, "SNAPSHOT_DIR", self.snapshot),
            patch.object(mri_sync, "MANIFEST_JSON", self.manifest_path),
            patch.object(mri_sync, "SNAPSHOT_FILES", self.files),
            patch.object(mri_sync.peer_paths, "mri_outputs_dir", return_value=self.originals),
        )
        for item in patches:
            item.start()
            self.addCleanup(item.stop)

    def test_source_update_during_read_cannot_mix_snapshot_metadata(self):
        source = self.originals / self.files[0]
        old = b'{"date":"2026-10-26","version":"old"}\r\n'
        new = b'{"date":"2026-10-27","version":"new"}\r\n'
        source.write_bytes(old)
        read = Path.read_bytes
        observed = []

        def mutate_after_first_read(path):
            value = read(path)
            if path == source:
                observed.append(value)
                if len(observed) == 1:
                    source.write_bytes(new)
            return value

        with patch.object(Path, "read_bytes", mutate_after_first_read):
            manifest = mri_sync.sync_mri_snapshot()

        self.assertEqual(observed, [old])
        self.assertEqual(source.read_bytes(), new)
        self.assertEqual((self.snapshot / source.name).read_bytes(), old)
        self.assertEqual(manifest["files"][source.name], {
            "mri_date": "2026-10-26", "sha256": sha256(old).hexdigest()
        })
        self.assertEqual(json.loads(self.manifest_path.read_text()), manifest)

    def test_date_field_variants_and_optional_absent_file(self):
        payloads = {
            "current_regime.json": (b'{"date":"2026-10-25"}', "2026-10-25"),
            "shock_register.json": (b'{"asof":"2026-10-26"}', "2026-10-26"),
            "event_register_run.json": (b'{"as_of_date":"2026-10-27"}', "2026-10-27"),
        }
        for name, (raw, _) in payloads.items():
            (self.originals / name).write_bytes(raw)
        manifest = mri_sync.sync_mri_snapshot()
        for name, (raw, date) in payloads.items():
            self.assertEqual(manifest["files"][name]["mri_date"], date)
            self.assertEqual(manifest["files"][name]["sha256"], sha256(raw).hexdigest())
            self.assertEqual((self.snapshot / name).read_bytes(), raw)
        self.assertEqual(set(manifest), {"copied_at", "source_dir", "files"})

    def test_missing_optional_and_unparseable_original(self):
        invalid = b"not valid json\xff"
        (self.originals / self.files[0]).write_bytes(invalid)
        manifest = mri_sync.sync_mri_snapshot()
        self.assertEqual(set(manifest["files"]), {self.files[0]})
        self.assertIsNone(manifest["files"][self.files[0]]["mri_date"])
        self.assertEqual(manifest["files"][self.files[0]]["sha256"], sha256(invalid).hexdigest())

    def test_absent_mri_preserves_existing_snapshot(self):
        self.snapshot.mkdir()
        self.manifest_path.write_text("existing manifest")
        with patch.object(mri_sync.peer_paths, "mri_outputs_dir", return_value=None):
            self.assertIsNone(mri_sync.sync_mri_snapshot())
        self.assertEqual(self.manifest_path.read_text(), "existing manifest")

    def test_original_read_failure_does_not_publish_manifest(self):
        source = self.originals / self.files[0]
        source.write_bytes(b'{"date":"2026-10-26"}')
        read = Path.read_bytes

        def fail_read(path):
            if path == source:
                raise OSError("fixture read failure")
            return read(path)

        with patch.object(Path, "read_bytes", fail_read):
            with self.assertRaises(OSError):
                mri_sync.sync_mri_snapshot()
        self.assertFalse(self.manifest_path.exists())

    def test_copy_corruption_refuses_manifest(self):
        source = self.originals / self.files[0]
        source.write_bytes(b'{"date":"2026-10-26"}')
        write = Path.write_bytes

        def corrupt_destination(path, raw):
            if path == self.snapshot / self.files[0]:
                return write(path, b"corruption")
            return write(path, raw)

        with patch.object(Path, "write_bytes", corrupt_destination):
            with self.assertRaisesRegex(OSError, "byte mismatch"):
                mri_sync.sync_mri_snapshot()
        self.assertFalse(self.manifest_path.exists())


if __name__ == "__main__":
    unittest.main()
