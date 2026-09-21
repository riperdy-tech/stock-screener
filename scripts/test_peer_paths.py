"""Unit tests for the peer-repository path contract (scripts/peer_paths.py).

The property that matters: resolution must work under BOTH the current nested layout, where this
repo sits inside a wrapper folder beside the Macro Regime Indicator, and the post-move sibling
layout - without an edit in between. The old code walked `ROOT.parent / "Macro Regime Indicator"`,
so the nesting depth was load-bearing and the move would have broken it silently.
"""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import peer_paths  # noqa: E402

PEER_VARS = ("STOCKS_ROOT", "MRI_DIR", "MRI_ENV_FILE", "MRI_OUTPUTS_DIR")


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    """No test may depend on this machine's real layout or on a stray variable."""
    for var in PEER_VARS:
        monkeypatch.delenv(var, raising=False)


def test_current_nested_layout_resolves(tmp_path, monkeypatch):
    monkeypatch.setenv("STOCKS_ROOT", str(tmp_path))
    mri = tmp_path / "Macro Regime Indicator"
    (mri / "outputs").mkdir(parents=True)

    assert peer_paths.mri_dir() == mri
    assert peer_paths.mri_env_file() == mri / ".env"
    assert peer_paths.mri_outputs_dir() == mri / "outputs"


def test_post_move_sibling_layout_resolves(tmp_path, monkeypatch):
    monkeypatch.setenv("STOCKS_ROOT", str(tmp_path))
    mri = tmp_path / "macro-regime-indicator"
    (mri / "outputs").mkdir(parents=True)

    assert peer_paths.mri_dir() == mri
    assert peer_paths.mri_outputs_dir() == mri / "outputs"


def test_nested_spelling_wins_while_both_exist(tmp_path, monkeypatch):
    """During the move both can be on disk. The current spelling is first, so a half-finished
    move never resolves to a freshly created empty sibling."""
    monkeypatch.setenv("STOCKS_ROOT", str(tmp_path))
    nested = tmp_path / "Macro Regime Indicator"
    nested.mkdir()
    (tmp_path / "macro-regime-indicator").mkdir()

    assert peer_paths.mri_dir() == nested


def test_grandparent_is_searched_so_todays_real_layout_works(tmp_path, monkeypatch):
    """With no STOCKS_ROOT set, both the parent and the grandparent of this repo are candidates.
    Today the MRI is a sibling of the WRAPPER, one level above this repo's parent."""
    repo = tmp_path / "wrapper" / "stock-screener"
    repo.mkdir(parents=True)
    mri = tmp_path / "Macro Regime Indicator"
    mri.mkdir()
    monkeypatch.setattr(peer_paths, "ROOT", repo)

    assert peer_paths.mri_dir() == mri


def test_env_override_is_used_verbatim_even_when_missing(tmp_path, monkeypatch):
    monkeypatch.setenv("STOCKS_ROOT", str(tmp_path))
    (tmp_path / "macro-regime-indicator").mkdir()
    monkeypatch.setenv("MRI_DIR", str(tmp_path / "typo"))

    assert peer_paths.mri_dir() == tmp_path / "typo"


def test_mri_env_file_override_is_independent_of_mri_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("MRI_ENV_FILE", str(tmp_path / "secrets" / "fred.env"))

    assert peer_paths.mri_env_file() == tmp_path / "secrets" / "fred.env"


def test_outputs_override_is_independent_of_mri_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("MRI_OUTPUTS_DIR", str(tmp_path / "vintage_2026_09"))

    assert peer_paths.mri_outputs_dir() == tmp_path / "vintage_2026_09"


def test_absent_mri_is_none_not_a_wrong_guess(tmp_path, monkeypatch):
    """Absent by default rather than fatal: only fetch_macro_state.py needs the MRI, and it
    reports the path it tried. Returning a plausible-but-wrong path would be worse than None."""
    monkeypatch.setenv("STOCKS_ROOT", str(tmp_path))

    assert peer_paths.mri_dir() is None
    assert peer_paths.mri_env_file() is None
    assert peer_paths.mri_outputs_dir() is None


def test_required_raises_and_names_every_candidate(tmp_path, monkeypatch):
    monkeypatch.setenv("STOCKS_ROOT", str(tmp_path))

    with pytest.raises(FileNotFoundError) as excinfo:
        peer_paths.mri_dir(required=True)

    msg = str(excinfo.value)
    assert "MRI_DIR" in msg
    assert "Macro Regime Indicator" in msg and "macro-regime-indicator" in msg
    assert "do not guess" in msg
