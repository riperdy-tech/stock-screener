# RS2 Verdict Outcome Report

Generated: 2026-08-11T09:39:22Z  |  Benchmarks: IWM (primary), SPY, QQQ

Ledger: 1793 verdicts, 266 names, 2026-06-29 -> 2026-08-11. Graded verdict-horizons: 600; pending: 6567; missing entry/exit: 4/1.

**Read the name-weighted columns first** — repeat verdicts on one name are correlated observations, and verdict-weighted means overweight frequently re-analyzed names. Descriptive only; no significance claimed.

## 30-day horizon

All verdicts: n=600 (230 names) | mean excess vs IWM -1.66% | name-weighted 0.27% (median 0.86%, 53.5% of names beat IWM)

### action_family

| Bucket | n | names | mean ret | mean xIWM | med xIWM | %>IWM | name-wt xIWM | name-wt med | name-wt %>IWM |
|---|---|---|---|---|---|---|---|---|---|
| ? | 6 | 6 | -0.55% | -1.07% | 0.21% | 50.0% | -1.07% | 0.21% | 50.0% |
| BEAR | 60 | 58 | -9.38% | -6.96% | -3.74% | 30.0% | -7.24% | -3.74% | 31.0% |
| BULL | 67 | 43 | 5.39% | 6.04% | 6.45% | 68.7% | 4.4% | 5.48% | 62.8% |
| HOLD | 467 | 209 | -2.21% | -2.09% | -3.15% | 40.9% | 0.21% | 0.93% | 52.6% |

### stance (deterministic gap)

| Bucket | n | names | mean ret | mean xIWM | med xIWM | %>IWM | name-wt xIWM | name-wt med | name-wt %>IWM |
|---|---|---|---|---|---|---|---|---|---|
| None | 5 | 4 | -18.98% | -16.54% | -18.34% | 20.0% | -15.04% | -20.45% | 25.0% |
| fair | 344 | 158 | -1.95% | -1.81% | -2.92% | 42.4% | 1.17% | 1.27% | 55.7% |
| overvalued | 166 | 94 | -4.84% | -4.14% | -4.02% | 33.1% | -2.58% | -2.86% | 40.4% |
| undervalued | 85 | 54 | 3.92% | 4.68% | 4.2% | 65.9% | 3.75% | 3.33% | 63.0% |

### ABLATION stance x family

| Bucket | n | names | mean ret | mean xIWM | med xIWM | %>IWM | name-wt xIWM | name-wt med | name-wt %>IWM |
|---|---|---|---|---|---|---|---|---|---|
| None|BEAR | 2 | 2 | -26.0% | -22.52% | -22.52% | 0.0% | -22.52% | -22.52% | 0.0% |
| None|BULL | 1 | 1 | -11.11% | -12.05% | -12.05% | 0.0% | -12.05% | -12.05% | 0.0% |
| None|HOLD | 2 | 2 | -15.89% | -12.8% | -12.8% | 50.0% | -12.8% | -12.8% | 50.0% |
| fair|? | 3 | 3 | 0.0% | -1.15% | -2.2% | 33.3% | -1.15% | -2.2% | 33.3% |
| fair|BEAR | 5 | 5 | 2.43% | 3.19% | -0.1% | 40.0% | 3.19% | -0.1% | 40.0% |
| fair|BULL | 26 | 20 | 4.55% | 4.84% | 5.02% | 65.4% | 1.78% | 0.58% | 55.0% |
| fair|HOLD | 310 | 148 | -2.59% | -2.45% | -3.68% | 40.6% | 1.03% | 1.29% | 55.4% |
| overvalued|? | 1 | 1 | 0.02% | 3.5% | 3.5% | 100.0% | 3.5% | 3.5% | 100.0% |
| overvalued|BEAR | 53 | 51 | -9.87% | -7.33% | -4.5% | 30.2% | -7.67% | -4.5% | 31.4% |
| overvalued|BULL | 2 | 2 | -13.04% | -12.07% | -12.07% | 0.0% | -12.07% | -12.07% | 0.0% |
| overvalued|HOLD | 110 | 80 | -2.31% | -2.52% | -3.92% | 34.5% | -1.53% | -2.91% | 41.2% |
| undervalued|? | 2 | 2 | -1.66% | -3.23% | -3.23% | 50.0% | -3.23% | -3.23% | 50.0% |
| undervalued|BULL | 38 | 23 | 7.36% | 8.3% | 10.02% | 76.3% | 8.8% | 9.84% | 78.3% |
| undervalued|HOLD | 45 | 36 | 1.27% | 1.98% | 1.23% | 57.8% | 1.76% | 1.5% | 55.6% |

### raw-BULL: brake efficacy

| Bucket | n | names | mean ret | mean xIWM | med xIWM | %>IWM | name-wt xIWM | name-wt med | name-wt %>IWM |
|---|---|---|---|---|---|---|---|---|---|
| brake re-tiered | 44 | 43 | 3.45% | 4.91% | 4.68% | 61.4% | 5.35% | 5.31% | 62.8% |
| left as BULL | 64 | 41 | 5.48% | 6.05% | 6.67% | 67.2% | 4.15% | 5.34% | 61.0% |

### research_cited

| Bucket | n | names | mean ret | mean xIWM | med xIWM | %>IWM | name-wt xIWM | name-wt med | name-wt %>IWM |
|---|---|---|---|---|---|---|---|---|---|
| False | 348 | 178 | -1.55% | -2.28% | -4.86% | 37.6% | 0.68% | -0.21% | 49.4% |
| None | 192 | 192 | -2.77% | -0.02% | 1.6% | 54.7% | -0.02% | 1.6% | 54.7% |
| True | 60 | 47 | -2.73% | -3.26% | -3.46% | 36.7% | -2.81% | -3.44% | 36.2% |

### entry_timing

| Bucket | n | names | mean ret | mean xIWM | med xIWM | %>IWM | name-wt xIWM | name-wt med | name-wt %>IWM |
|---|---|---|---|---|---|---|---|---|---|
| None | 3 | 3 | 3.32% | 5.96% | 5.48% | 100.0% | 5.96% | 5.48% | 100.0% |
| buy | 43 | 26 | 8.26% | 8.59% | 10.88% | 79.1% | 6.4% | 7.49% | 73.1% |
| stage | 261 | 151 | -0.27% | 0.57% | 1.12% | 53.6% | 1.43% | 2.14% | 58.3% |
| wait_for_pullback | 293 | 112 | -5.22% | -5.22% | -9.43% | 27.6% | -2.69% | -2.86% | 40.2% |

Conviction vs excess-IWM Spearman: all=0.342  bull-only=0.233

**No price series** (1): MASI

