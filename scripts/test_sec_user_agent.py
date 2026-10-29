"""Every SEC fetcher sends the operator's own contact from SEC_USER_AGENT and refuses to run without one.

SEC answers HTTP 403 to a request whose User-Agent has no contact, and this repository is public: a
hardcoded contact would make every clone send someone else's. A missing contact must fail loudly, never
be swallowed into a per-CIK "fetch failed".
"""
import importlib.util
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
MODULES = ("fetch_sec_data", "fetch_sec_descriptions", "build_fundamentals_history")


def _load(name):
    spec = importlib.util.spec_from_file_location(f"_ua_{name}", HERE / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.mark.parametrize("name", MODULES)
def test_the_contact_comes_from_the_environment(monkeypatch, name):
    monkeypatch.setenv("SEC_USER_AGENT", "  Jane Doe jane@example.com ")
    assert _load(name).sec_headers() == {"User-Agent": "Jane Doe jane@example.com"}


@pytest.mark.parametrize("name", MODULES)
@pytest.mark.parametrize("value", [None, "", "StockScreener/1.0"])
def test_a_missing_contact_raises(monkeypatch, name, value):
    if value is None:
        monkeypatch.delenv("SEC_USER_AGENT", raising=False)
    else:
        monkeypatch.setenv("SEC_USER_AGENT", value)
    with pytest.raises(RuntimeError, match="SEC_USER_AGENT"):
        _load(name).sec_headers()


def test_fetch_submission_does_not_swallow_a_missing_contact(monkeypatch):
    mod = _load("fetch_sec_descriptions")
    monkeypatch.delenv("SEC_USER_AGENT", raising=False)
    monkeypatch.setattr(mod.requests, "get", lambda *a, **k: pytest.fail("reached the network"))
    with pytest.raises(RuntimeError, match="SEC_USER_AGENT"):
        mod.fetch_submission("0000320193")
