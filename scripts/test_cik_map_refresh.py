"""test_cik_map_refresh.py — the CIK map is refreshed from SEC's ticker file on every
fundamentals build, SEC's entries laid over the stored ones. Stubbed download: no network."""
import json

import build_fundamentals_history as bfh


def _store(tmp_path, monkeypatch, mapping):
    path = tmp_path / "cik_map.json"
    path.write_text(json.dumps({"fetched_at": "2026-06-10T16:28:15Z", "map": mapping}), encoding="utf-8")
    monkeypatch.setattr(bfh, "CIK_MAP_JSON", path)
    return path


def _stub(monkeypatch, fresh):
    monkeypatch.setattr(bfh, "fetch_sec_cik_map", lambda: fresh)


def test_union_with_sec_values_winning(tmp_path, monkeypatch):
    path = _store(tmp_path, monkeypatch, {"OLD": "0000000001", "BOTH": "0000000002"})
    _stub(monkeypatch, {"BOTH": "0000000002", "NEW": "0000000003"})
    cik_map, report = bfh.refresh_cik_map()
    assert cik_map == {"OLD": "0000000001", "BOTH": "0000000002", "NEW": "0000000003"}
    assert json.loads(path.read_text(encoding="utf-8"))["map"] == cik_map
    assert report["status"] == "refreshed" and report["added"] == 1 and report["changed"] == []


def test_changed_cik_is_recorded_and_new_value_wins(tmp_path, monkeypatch):
    _store(tmp_path, monkeypatch, {"AAA": "0000000001", "BBB": "0000000002"})
    _stub(monkeypatch, {"AAA": "0000000009", "BBB": "0000000002"})
    cik_map, report = bfh.refresh_cik_map()
    assert cik_map["AAA"] == "0000000009"
    assert report["changed"] == [{"ticker": "AAA", "old": "0000000001", "new": "0000000009"}]


def test_failed_download_keeps_stored_map_and_says_so(tmp_path, monkeypatch, capsys):
    path = _store(tmp_path, monkeypatch, {"OLD": "0000000001"})
    before = path.read_text(encoding="utf-8")

    def boom():
        raise RuntimeError("SEC down")
    monkeypatch.setattr(bfh, "fetch_sec_cik_map", boom)
    cik_map, report = bfh.refresh_cik_map()
    assert cik_map == {"OLD": "0000000001"}
    assert path.read_text(encoding="utf-8") == before
    assert report["status"].startswith("FAILED") and "SEC down" in report["status"]
    assert "CIK MAP REFRESH FAILED" in capsys.readouterr().out


def test_empty_sec_file_counts_as_a_failure(tmp_path, monkeypatch, capsys):
    _store(tmp_path, monkeypatch, {"OLD": "0000000001"})
    _stub(monkeypatch, {})
    cik_map, report = bfh.refresh_cik_map()
    assert cik_map == {"OLD": "0000000001"} and report["status"].startswith("FAILED")


def test_output_shape_equals_the_stored_files(tmp_path, monkeypatch):
    path = _store(tmp_path, monkeypatch, {"OLD": "0000000001"})
    _stub(monkeypatch, {"NEW": "0000000003"})
    bfh.refresh_cik_map()
    doc = json.loads(path.read_text(encoding="utf-8"))
    assert sorted(doc) == ["fetched_at", "map"]
    assert doc["fetched_at"] != "2026-06-10T16:28:15Z"
    assert all(isinstance(k, str) and isinstance(v, str) and len(v) == 10 for k, v in doc["map"].items())
