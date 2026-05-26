# Unused-Imports Audit — `Stock Screener/scripts/` (PARTIAL)

> Compiled from worker log `logs/task-06-scan-unused-imports-20260525-085439.log`.
> Worker hit MAX_STEPS=30 and never called `finish` to produce a consolidated table —
> findings extracted by the reviewer from per-step grep output.
> **6 of the 22 listed files were not reached.** See gap list at bottom.

## Confirmed unused imports

| File | Line | Import | Notes |
|---|---|---|---|
| `scripts/fetch_data.py` | (top of file) | `import io` | Not referenced anywhere; grep for `io.` / `StringIO` / `BytesIO` returned no matches |
| `scripts/fetch_data.py` | 12 | `import base64` | Only appears on the import line; no use sites |
| `scripts/fetch_data_intl.py` | 2 | `import numpy as np` | Imported, never used |
| `scripts/fetch_data_intl.py` | 8 | `import base64` | Imported, never used |
| `scripts/fetch_india.py` | 2 | `import numpy as np` | Imported, never used (note: `base64` and `time` ARE used here) |
| `scripts/fetch_korea.py` | 2 | `import numpy as np` | Imported, never used |
| `scripts/fetch_korea.py` | 4 | `import time` | Imported, never used (no `time.sleep` calls in this file) |
| `scripts/fetch_taiwan.py` | 2 | `import numpy as np` | Imported, never used |
| `scripts/fetch_taiwan.py` | 4 | `import time` | Imported, never used |
| `scripts/fetch_sec_data.py` | 7 | `import time` | Imported, never used |
| `scripts/fetch_sec_data.py` | 8 | `import base64` | Imported, never used (the file uses `zipfile` instead) |
| `scripts/patch_roic.py` | 4 | `import numpy as np` | Imported, never used; explicitly grep-confirmed (`np.` → no matches) |

## Files confirmed clean (all imports used)

- `scripts/ai_worker.py` (incl. `timedelta`)
- `scripts/score_reverse.py` (only `json`, `pathlib.Path`; `math` checked elsewhere)
- `scripts/fetch_phase2_screener.py` (`argparse`, `random` — both used)
- `scripts/get_ticker_data.py` (`numpy` used via `np.isnan`/`np.isinf`)
- `scripts/get_ticker_data_intl.py` (`pandas` used via `pd.isna`, `pd.read_html`)
- `scripts/patch_full_audit.py` (`base64` used in `base64.b64encode`)
- `scripts/patch_margins.py` (`base64` used in `base64.b64encode`)

## ⚠ Gap — files NOT audited

The worker hit step 30 mid-loop on `inspect_nse.py`. The following files from the task's listed set were never reached:

- `scripts/inspect_nse.py` (started — only `requests` checked, nothing else)
- `scripts/inspect_reverse.py`
- `scripts/get_prices.py`
- `scripts/refresh_missing_data.py`
- `scripts/show_examples.py`
- `scripts/test_intl.py`
- `scripts/verify_data_sources.py`
- `scripts/compile_intl_csv.py`

A follow-up task can pick these up. Root cause: `deepseek_worker.py` `MAX_STEPS=30` is too tight for a 22-file scan even with heavy grep batching, and the worker had no in-loop step-budget awareness.

## Recommendation

Action on the confirmed findings is safe (delete the listed import lines — no behavior change). The 8 unaudited files should be swept in a follow-up before declaring the audit complete.
