# Self-Hosted Runner Setup — Scheduled Data Fetch

Scheduled runs of **Scheduled Data Fetch** now target the home PC's self-hosted runner.
Manual runs still default to `ubuntu-latest`, so the GitHub path stays available whenever
the PC is off. Nothing else moved: Post-Close Price Refresh, Paradigm Weekly Analyst,
KIS Portfolio Sync, Overlay Freshness Watchdog and Factor IC Monitor all still run on
GitHub's runners.

Expected saving: roughly 2200 of ~3760 billed minutes per month, taking usage to about
1540 against the 2000-minute free allowance for private repositories.

## Before you start

The runner clones the repository into its own work directory. Your development checkout at
`C:\Users\riper\Downloads\Stock Screener\Stock Screener` is never touched by a workflow run.
The clone needs roughly 4 GB; the C: drive currently has about 338 GB free.

## 1. Create the runner

In the browser, open the repository's **Settings -> Actions -> Runners -> New self-hosted runner**
and select **Windows / x64**. GitHub shows a download command and a registration token.
That token is short-lived and is tied to your account — copy it straight from that page and
do not paste it into a chat or commit it.

Install to a short path. The repository contains `node_modules`, and a deep runner directory
plus a nested clone can exceed the Windows 260-character path limit.

```powershell
mkdir C:\actions-runner; cd C:\actions-runner
```

Then run the download and extract commands shown on that settings page, followed by:

```powershell
.\config.cmd --url https://github.com/riperdy-tech/stock-screener --token <TOKEN_FROM_THE_PAGE> --name rs2-pc --work _work --unattended
```

No `--labels` is needed: every self-hosted runner gets `self-hosted`, `Windows` and `X64`
automatically, and `runs-on: self-hosted` matches the first of those.

## 2. Run it as a service

A service starts at boot and does not need you to be logged in, which matters because the
data fetch cron fires at 14:35 UTC (22:35 Taipei).

```powershell
cd C:\actions-runner; .\svc.cmd install; .\svc.cmd start; .\svc.cmd status
```

Confirm the runner shows as **Idle** on the Settings -> Actions -> Runners page.

## 3. Stop the PC from sleeping through a run

A sleeping machine does not fail the job — it leaves it queued. Keep the machine awake, or at
least awake across the cron window:

```powershell
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
```

## 4. First run — verify before trusting the schedule

Trigger the workflow manually from the Actions tab and set the **Runner** input to
`self-hosted`. Watch for these specific things:

- The `Setup Python` step downloads CPython 3.11 into the runner's tool cache on the first run
  only. Expect a few extra minutes once; later runs reuse it.
- Every `run:` block must execute as bash, not PowerShell. A PowerShell error such as
  `The term '[' is not recognized` means the `defaults.run.shell: bash` setting did not apply.
- The commit produced by the run should contain only real data changes. Line endings were
  tested on this machine on 2026-08-25 and do not corrupt commits either way, so the
  `GIT_CONFIG_*` variables in the job are parity insurance rather than a fix; a run that
  ignored them would still commit correctly.
- `KIS Portfolio Sync` should chain off the run exactly as it did before. Its trigger matches
  the workflow by name, and the name is unchanged.

## 5. Two behaviours worth knowing

**Stale queued runs are rejected.** If the runner is offline when the cron fires, the run
queues rather than failing, and could otherwise start hours later — fetching stale data and
handing it to the KIS trade chain. The `Reject a stale queued run` step fails the job when it
starts more than 90 minutes after its scheduled time. KIS Portfolio Sync gates on
`conclusion == 'success'`, so a rejected run blocks the trade rather than acting on stale data.

**A missed cron is silent.** Nothing alerts you when the PC was off and the run never
happened. If you want that covered, the freshness-watchdog pattern already used for
`llm_overlay.json` can be pointed at `public/data/chain_manifest.json` from a GitHub-hosted job.

## 6. Rolling back

To move everything back to GitHub's runners, change both `runs-on:` lines in
`.github/workflows/schedule-data-fetch.yml` to `ubuntu-latest`. To take the PC out of service
without touching the workflow, stop the runner service (`.\svc.cmd stop`) and dispatch runs
manually — but note that scheduled runs will then queue and be rejected by the staleness guard.
