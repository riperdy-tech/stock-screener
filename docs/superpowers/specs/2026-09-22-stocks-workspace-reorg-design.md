# Stocks Workspace Reorganization — Design

**Date:** 2026-09-22
**Status:** approved, ready for implementation planning
**Scope:** the physical and configuration layout of the four stock-system repositories, the
contract by which they locate each other, and the removal of accumulated agent-tooling cruft.

## Problem

Three cooperating systems and one state store are laid out in a way that hides their
relationship and makes any folder move a breaking change.

The stock-screener repository and the Macro Regime Indicator repository both live *inside* a
folder named `Stock Screener` that is not itself a repository. That folder also holds loose
shared documents, scripts, and five near-duplicate agent instruction files produced by four
different IDEs across several model migrations. The nesting is load-bearing: the screener
resolves the Macro Regime Indicator by walking up one level and back down by name.

Cross-repository references are hardcoded absolute Windows paths, scattered across three
repositories, with no single place that declares where anything lives.

## Measured coupling

Every cross-repository handoff is a data artifact on disk or a git operation. There are **zero
cross-repository code imports** and no shared packages. This is the fact that decides the
repository question.

### Filesystem dependencies (6)

| From | To | Kind |
| --- | --- | --- |
| `rs2-local/config.json:6` `mri_outputs_dir` | `Stock Screener/Macro Regime Indicator/outputs` | absolute |
| `rs2-local/config.json:8` `anchors_dir` | same | absolute |
| `rs2-local/config.json:4` `screener_publish_repo` | `Downloads/screener-publish` | absolute |
| `stock-screener/scripts/fetch_macro_state.py:128` | `ROOT.parent / "Macro Regime Indicator" / ".env"` | relative — depends on nesting |
| `macro-regime-indicator/scripts/build_equity_aggregate.py:44` | `Stock Screener/Stock Screener/public/data` | absolute |
| `macro-regime-indicator/scripts/build_valuation_panel.py:60` | same | absolute |
| `macro-regime-indicator/src/macro_engine/daily_health.py:212` | `RS2 Local/config.json` | absolute, with an existing `RS2_CONFIG_PATH` override |

### Non-filesystem coupling

- `rs2-local` publishes the depth overlay by committing and pushing through the dedicated
  `screener-publish` clone, which `orchestrate_depth.publish_overlay()` resets to `origin/main`
  on every run. This isolation exists because publishing from the shared development tree
  corrupted the overlay on 2026-08-26.
- `rs2-local/control_agent.py:29` dispatches `kis-sync.yml` and `schedule-data-fetch.yml` against
  `riperdy-tech/stock-screener` through the GitHub CLI.
- `stock-screener/app/api/admin/takeover/route.ts:133` dispatches `depth-cloud-backstop.yml`
  against `riperdy-tech/rs2-local`.
- `rs2-state` is a git-mediated state store for depth pipeline state.

## Decision: separate repositories

The four repositories stay separate, with separate GitHub remotes. Artifact coupling is what
separate repositories are for; import coupling would argue for a monorepo, and there is none.

Three concrete things would break under a merge:

1. **Vercel.** The stock-screener repository root is its deployment root. A monorepo requires a
   project-root override and reworked ignore rules, against an existing deployment-size
   constraint already tracked on `claude/vercel-limit-management-qwpz83`.
2. **Publish isolation.** The `screener-publish` clone derives its entire value from being a
   separate checkout of a separate repository.
3. **Independent CI cadences.** `daily-dashboard.yml` (MRI), `kis-sync.yml` and
   `schedule-data-fetch.yml` (screener), `depth-cloud-backstop.yml` (RS2) run on different
   schedules against different data. One repository's push churn should not trigger all of them.

The cost of staying separate is six path references. The confusion is caused by those six being
undeclared, not by the repository boundaries.

## Target topology

```
C:\Users\riper\stocks\
├── AGENTS.md                    cross-system rules; the only file loaded at startup
│                                when the parent folder is opened in an agent
├── stock-screener\              repo, Vercel deployment root
├── rs2-local\                   repo
├── macro-regime-indicator\      repo — a sibling, no longer nested
├── rs2-state\                   repo
├── screener-publish\            repo, dedicated publish clone; config-only change
└── stocks-workspace\            repo: cross-system docs, specs and scripts that two or more
                                 repositories cite by name
```

Siblings rather than nesting, so that no path can depend on directory depth again.

`stocks-workspace` is a repository rather than a loose folder because the current wrapper holds
live shared artifacts that other repositories cite by absolute path — for example
`docs/WACC_ENGINE_SPEC_v1.1_RS2_ALIGNED.md`, modified 2026-09-21 and cited by the RS2 rate-engine
implementation plans. Shared specifications that two repositories depend on should be versioned.

## The path contract

Each cross-repository path becomes an environment variable with a default derived from a single
root. Each repository resolves these in exactly one place: `config.json` for RS2, a small
`paths` module for the screener scripts and for MRI.

| Variable | Consumed by | Replaces |
| --- | --- | --- |
| `STOCKS_ROOT` | all | the implicit `Downloads` assumption |
| `MRI_OUTPUTS_DIR` | `rs2-local/config.json:6,8` | two absolute paths |
| `SCREENER_PUBLISH_REPO` | `rs2-local/config.json:4` | one absolute path |
| `MRI_ENV_FILE` | `stock-screener/scripts/fetch_macro_state.py:128` | the `ROOT.parent` reach |
| `SCREENER_DATA_DIR` | `macro-regime-indicator/scripts/build_equity_aggregate.py:44`, `build_valuation_panel.py:60` | two absolute paths |
| `RS2_CONFIG_PATH` | `macro-regime-indicator/src/macro_engine/daily_health.py:212` | already exists; stop defaulting to an absolute path |

`STOCKS_ROOT` defaults to `C:\Users\riper\Downloads` until the move happens. Every other default
derives from it. The contract therefore lands as a behavioral no-op and can be verified while
every folder is still in its current location.

### Sequencing

Contract first, move second. This was an explicit operator decision on 2026-09-22.

1. Introduce the contract in all three repositories with defaults matching today's layout.
2. Verify: each repository's test suite, one MRI run, one screener `fetch_macro_state.py` run,
   one RS2 depth run that reaches the publish step.
3. Physically move the folders.
4. Change `STOCKS_ROOT` in one place.
5. Re-register the scheduled tasks.

The move becomes a configuration change rather than a code change, and each step is
independently verifiable.

### Scheduled tasks

Six Windows scheduled tasks hardcode `C:\Users\riper\Downloads\RS2 Local`:
`RS2-Control-Agent`, `RS2-Depth-Orchestrator`, `RS2-KIS-Dispatch`, `RS2-Orchestrator`,
`RS2-SDF-Dispatch`, `RS2-Telegram-Bot`. They are re-registered from
`register_control_tasks.ps1` and `register_bot_task.ps1`, driven off `STOCKS_ROOT`, as part of
step 5. `RS2-Depth-Orchestrator` and `RS2-Orchestrator` are currently Disabled; the other four
are Ready, and `RS2-Telegram-Bot` is live.

## Agent instruction files

The sprawl is confined to the non-repository wrapper, and it is thinner than it appears.

| Item | Finding | Action |
| --- | --- | --- |
| `AGENTS.md` (2977 B), `CODEX.md` (2430 B), `GEMINI.md` (2282 B) | differ by 13 lines each | `AGENTS.md` becomes the sole source; the others become one-line pointers |
| `CLAUDE.md` (198 B) | a stub reading "# Ground Rules" | pointer to `AGENTS.md` |
| three `*-mcp-config.json` | all three register the same single server, `sdl-mcp` | keep as thin per-IDE wrappers, since their schemas differ; drop the duplicated body |
| `SDL.md` (25.7 KB) | the substantive SDL-MCP workflow document | move to `stocks-workspace/docs/` |

Per-repository instruction files stay as they are. Each repository having exactly one is correct:
`stock-screener/AGENTS.md`, `macro-regime-indicator/AGENTS.md`, `rs2-local/CLAUDE.md`.

### Why one root file plus one per repository

Opening the parent folder in an agent loads only a rules file sitting at that folder, plus true
ancestors. Per-repository files load lazily, when work actually touches that subtree. So the
root `AGENTS.md` should carry the cross-system rules — the path contract and the non-negotiables
— and each repository's file should carry only what is specific to it.

Worth recording: the wrapper's files are not currently ancestors of `rs2-local`, so RS2 has never
loaded them. And Antigravity's recorded workspace for the 2026-09-15 to 09-20 sessions was
`file:///c:/Users/riper/Downloads`, the root, where no rules file auto-loads at all.

## Cleanup ledger

| Item | Finding | Action |
| --- | --- | --- |
| `.sdl-mcp/` | 0 files | delete |
| `.agent-locks/` | 1 file, unmodified since 2026-06-23 | delete |
| `.understand-anything/` | 257 files, unmodified since 2026-07-02 | delete after operator confirmation |
| `archive/` | 2968 files, unmodified since 2026-06-23 | cold-archive outside the working tree |
| `backups/` (15 files), `logs/` (32 files) | both unmodified since 2026-06-23 | cold-archive |
| `scripts/` (86 files), `docs/` (5 files) | modified 2026-09-16 and 09-21; live | move to `stocks-workspace` |
| `scratch/` (13 files) | modified 2026-09-16; live but disposable | keep, untracked |
| worktree `codex/rs2-audit-20260912` | present in both `stock-screener` and `rs2-local` | `git worktree remove` after confirming the branch is merged or dead |
| worktree `codex/rs2-shadow-quant` | `stock-screener` only | same |
| `Downloads/Macro Regime Indicator/` | stub, one entry | verify, then delete |
| `Downloads/Stock Scre aanvragen Stock Screener/` | stub, one entry | verify, then delete |
| `Downloads/maribe/` | one entry, `Macro-Regime-Identifier-master` | verify, then delete |
| `Downloads/Chatgpt Analysis for RS2 Local Refinement/` | two entries; a copy also exists inside `rs2-local` | verify, then delete the outer copy |

A `.gitignore` pass in each repository accompanies the cleanup, so that scratch and quarantine
directories stop appearing as untracked noise. Flagged to the operator and approved with the
design on 2026-09-22.

Two calls in this design are reversible if they turn out wrong: making `stocks-workspace` a
repository rather than a plain untracked folder, and the `.gitignore` pass. Neither affects the
path contract.

## Out of scope

- Merging any repositories.
- The RS2 pack-revision and analyst-charter question, settled separately on 2026-09-22 by
  restoring the working tree to `b2f1cd6`.
- The fourteen `origin/main` commits that the RS2 working branch has not merged. Deliberately
  parked by operator decision; to be handled after the restore settles.

## Verification

The reorganization is complete when all of the following hold:

1. Each repository's test suite passes before the move and after it, unchanged.
2. `grep` across all four repositories finds no remaining absolute path containing `Downloads`
   or `Stock Screener` outside of documentation and archived material.
3. `stock-screener/scripts/fetch_macro_state.py` resolves the MRI environment file through
   `MRI_ENV_FILE` with no `ROOT.parent` traversal.
4. One RS2 depth run reaches `publish: depth_overlay.json pushed to screener repo` from the new
   location.
5. One MRI run writes its anchors, and an RS2 run consumes them, with
   `terminal_growth_source` and `coe_level_source` recorded in the backbone output.
6. All six scheduled tasks are registered against the new root and each has run once.
7. Opening the parent folder in Claude Code loads exactly one root `AGENTS.md`, and opening work
   inside a repository additionally loads exactly one file from that repository.
