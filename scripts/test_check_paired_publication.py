"""3L paired-publication source-owner regression and CI workflow contract tests."""
import copy
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import yaml
import check_paired_publication as pair

ROOT = Path(__file__).resolve().parents[1]
WORKFLOWS = ROOT / ".github" / "workflows"
PAIRED_COMMAND = "python scripts/check_paired_publication.py"


def entries():
    external = {
        "rev_composite": 0.0, "rev_rank": 1, "rev_nominated": False,
        "rev_flags": [], "rev_data_quality": None,
    }
    return [{"symbol": "ABC", "reverse": copy.deepcopy(external)}], {"ABC": external}


def workflow(name):
    with (WORKFLOWS / name).open("r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def publication_script(doc, job_name):
    job = doc["jobs"][job_name]
    return [step.get("run") for step in job["steps"] if step.get("run")
            and "git push origin main" in step["run"]]


class PairContractTests(unittest.TestCase):
    def test_positive_exact_and_zero_is_a_value(self):
        stocks, reverse = entries()
        self.assertEqual(pair.validate(stocks, reverse)["exact_pairs"], 1)

    def test_fails_if_one_side_is_missing(self):
        stocks, reverse = entries()
        del stocks[0]["reverse"]
        with self.assertRaisesRegex(ValueError, "embedded"):
            pair.validate(stocks, reverse)
        stocks, reverse = entries()
        reverse.clear()
        with self.assertRaisesRegex(ValueError, "nonempty"):
            pair.validate(stocks, reverse)

    def test_fails_mixed_version_even_with_same_count(self):
        stocks, reverse = entries()
        stocks[0]["reverse"]["rev_rank"] = 2
        with self.assertRaisesRegex(ValueError, "mixed-version"):
            pair.validate(stocks, reverse)

    def test_fails_extra_reverse_symbol_and_duplicates(self):
        stocks, reverse = entries()
        reverse["DEF"] = copy.deepcopy(reverse["ABC"])
        with self.assertRaisesRegex(ValueError, "absent"):
            pair.validate(stocks, reverse)
        stocks, reverse = entries()
        stocks.append(copy.deepcopy(stocks[0]))
        with self.assertRaisesRegex(ValueError, "duplicate"):
            pair.validate(stocks, reverse)

    def test_fails_missing_symbol_null_payload(self):
        stocks, reverse = entries()
        stocks[0]["symbol"] = ""
        with self.assertRaisesRegex(ValueError, "symbol"):
            pair.validate(stocks, reverse)
        stocks, reverse = entries()
        reverse["ABC"] = None
        with self.assertRaisesRegex(ValueError, "external"):
            pair.validate(stocks, reverse)

    def test_rejects_duplicate_json_fields_and_nonfinite_number(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "test.json"
            p.write_text('{"a": 1, "a": 2}', encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "duplicate"):
                pair._load(p)
            p.write_text('{"rev_composite": NaN}', encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "non-finite"):
                pair._load(p)

    def test_fail_closed_cli_on_corrupted_partial_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            (data / "stocks.json").write_text('[{"symbol":"ABC"}]', encoding="utf-8")
            (data / "reverse_scores.json").write_text('{"ABC":{"rev_rank":1}}', encoding="utf-8")
            with patch.object(pair, "DATA", data):
                self.assertEqual(pair.main(), 1)

    def test_daily_runs_fetch_and_score_in_same_job_before_one_push(self):
        doc = workflow("schedule-data-fetch.yml")
        self.assertEqual(set(doc["jobs"]), {"preflight", "fetch"})
        steps = doc["jobs"]["fetch"]["steps"]
        commands = [x.get("run", "") for x in steps]
        fetch_indices = [i for i, cmd in enumerate(commands) if "python scripts/fetch_data.py" in cmd]
        chain_indices = [i for i, cmd in enumerate(commands) if "python scripts/run_chain.py" in cmd]
        push_indices = [i for i, cmd in enumerate(commands) if "git push origin main" in cmd]
        self.assertEqual(len(fetch_indices), 1)
        self.assertEqual(len(chain_indices), 1)
        self.assertEqual(len(push_indices), 1)
        self.assertLess(fetch_indices[0], chain_indices[0])
        self.assertLess(chain_indices[0], push_indices[0])
        script = commands[push_indices[0]]
        self.assertEqual(script.count("git push origin main"), 1)
        self.assertIn("git add public/data/stocks.json", script)
        self.assertIn("git add public/data/reverse_scores.json", script)
        self.assertGreaterEqual(script.count(PAIRED_COMMAND), 2)
        self.assertLess(script.index(PAIRED_COMMAND), script.index("git commit "))
        self.assertLess(script.rindex(PAIRED_COMMAND), script.index("if git push origin main"))

    def test_weekly_price_and_daily_precheck_and_after_merge_check(self):
        for filename, jobname in [
            ("schedule-data-fetch.yml", "fetch"),
            ("paradigm-weekly-analyst.yml", "weekly-analyst"),
            ("price-refresh.yml", "refresh"),
        ]:
            with self.subTest(filename=filename):
                cmds = publication_script(workflow(filename), jobname)
                self.assertEqual(len(cmds), 1)
                cmd = cmds[0]
                self.assertIn("git add public/data/stocks.json", cmd)
                self.assertIn("git add public/data/reverse_scores.json", cmd)
                self.assertEqual(cmd.count(PAIRED_COMMAND), 2)
                self.assertLess(cmd.index(PAIRED_COMMAND), cmd.index("git commit "))
                self.assertLess(cmd.index("git merge -X ours"), cmd.rindex(PAIRED_COMMAND))
                self.assertLess(cmd.rindex(PAIRED_COMMAND), cmd.index("if git push origin main"))

    def test_same_concurrency_and_no_bypass_release(self):
        for name in ("schedule-data-fetch.yml", "price-refresh.yml",
                     "paradigm-weekly-analyst.yml"):
            self.assertEqual(workflow(name)["concurrency"]["group"], "data-writers")

    def test_changed_workflow_scripts_parse_as_bash(self):
        bash = Path("C:/Program Files/Git/bin/bash.exe")
        if not bash.is_file():
            self.skipTest("Git Bash unavailable; YAML/contract tests still run")
        for filename, jobname in (
            ("schedule-data-fetch.yml", "fetch"),
            ("paradigm-weekly-analyst.yml", "weekly-analyst"),
            ("price-refresh.yml", "refresh"),
        ):
            steps = workflow(filename)["jobs"][jobname]["steps"]
            for step in steps:
                cmd = step.get("run", "")
                if PAIRED_COMMAND in cmd or "python scripts/run_chain.py" in cmd:
                    with self.subTest(workflow=filename, step=step.get("name")):
                        proc = subprocess.run([str(bash), "-n"], input=cmd,
                                              text=True, capture_output=True, timeout=10)
                        self.assertEqual(proc.returncode, 0, proc.stderr)

    def test_failed_score_step_does_not_trigger_publish(self):
        doc = workflow("schedule-data-fetch.yml")
        steps = doc["jobs"]["fetch"]["steps"]
        score = next(s for s in steps if "python scripts/run_chain.py" in s.get("run", ""))
        publish = next(s for s in steps if "git push origin main" in s.get("run", ""))
        self.assertNotIn("continue-on-error", score)
        self.assertNotIn("if", publish)
        self.assertLess(steps.index(score), steps.index(publish))


if __name__ == "__main__":
    unittest.main()
