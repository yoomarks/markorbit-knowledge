"""Governed admission of one browser-downloaded official UKIPO journal ZIP.

This operator starts after a browser has downloaded the exact official ZIP to
an ordinary local download directory.  Freeze is read-only.  Apply requires an
exact SHA-bound GO token, admits the immutable ZIP to F:, stages structured
records on E: and original mark images on F:, and retains the browser download.
It does not write Data Engine or assert current registry truth.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlsplit

try:
    from . import ukipo_journal as journal
except ImportError:  # Direct script execution from workers/local_folder.
    import ukipo_journal as journal


GOV = Path(r"D:\yoomarks\governed-plans\910")
PLAN_KIND = "UKIPO_OFFICIAL_JOURNAL_ACQUIRE_STAGE_PLAN_V1"
RECEIPT_KIND = "UKIPO_OFFICIAL_JOURNAL_ACQUIRE_STAGE_RECEIPT_V1"
OFFICIAL_HOST = "www.ipo.gov.uk"
OFFICIAL_PATH_RE = re.compile(
    r"/tm/t-journal/t-tmj/tm-journals/(?P<issue>20\d{2}-\d{3})/jnl\.zip\Z"
)
REPO_ROOT = Path(__file__).resolve().parents[2]


def require(condition: bool, reason: str) -> None:
    if not condition:
        raise journal.UKIPOInputError(reason)


def canonical_json_sha(value: object) -> str:
    payload = json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def official_issue_url(issue: str) -> str:
    require(journal.ISSUE_RE.fullmatch(issue) is not None, "invalid issue")
    return f"https://{OFFICIAL_HOST}/tm/t-journal/t-tmj/tm-journals/{issue}/jnl.zip"


def validate_official_url(url: str, issue: str) -> str:
    parsed = urlsplit(url)
    match = OFFICIAL_PATH_RE.fullmatch(parsed.path)
    require(
        parsed.scheme == "https"
        and parsed.hostname == OFFICIAL_HOST
        and parsed.port is None
        and parsed.username is None
        and parsed.password is None
        and not parsed.query
        and not parsed.fragment
        and match is not None
        and match.group("issue") == issue,
        "official UKIPO ZIP URL is not the exact allowlisted issue URL",
    )
    canonical = official_issue_url(issue)
    require(url == canonical, "official UKIPO ZIP URL is not canonical")
    return canonical


def current_git_head() -> str:
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    head = result.stdout.strip()
    require(re.fullmatch(r"[0-9a-f]{40}", head) is not None, "invalid git HEAD")
    return head


def require_clean_repo() -> str:
    head = current_git_head()
    status = subprocess.run(
        ["git", "status", "--porcelain", "--untracked-files=no"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    require(not status.stdout.strip(), "operator repository must be clean")
    return head


def operator_sha256() -> str:
    return journal.sha256_file(Path(__file__))


def _scan_summary(report: dict) -> dict:
    keys = (
        "issue",
        "zip_filename",
        "zip_sha256",
        "zip_bytes",
        "detail_count",
        "domestic_details",
        "madrid_details",
        "mark_image_links",
        "unique_original_images",
        "unique_original_image_bytes",
        "missing_original_image_links",
        "image_evidence_complete",
    )
    return {key: report[key] for key in keys}


def make_plan(
    issue: str,
    official_url: str,
    browser_download: Path,
    *,
    incoming_root: Path = journal.RAW_ROOT,
    archive_root: Path = journal.ARCHIVE_ROOT,
    stage_root: Path = journal.STAGE_ROOT,
    asset_root: Path = journal.ASSET_ROOT,
) -> dict:
    validate_official_url(official_url, issue)
    candidate = browser_download.resolve()
    require(
        candidate.is_file() and not candidate.is_symlink(),
        "browser download must be one regular local file",
    )
    require(candidate.name.lower().endswith(".zip"), "browser download must be a ZIP")
    incoming = incoming_root / f"{issue}.zip"
    archived = archive_root / f"{issue}.zip"
    require(
        not incoming.exists() and not archived.exists(), "issue raw ZIP already exists"
    )

    report, _, _ = journal.scan_zip(candidate)
    require(report["issue"] == issue, "downloaded ZIP issue mismatch")
    stem = f"{issue}-{report['zip_sha256'][:12]}"
    records = stage_root / f"{stem}-details.jsonl"
    manifest = stage_root / f"{stem}-manifest.json"
    require(
        not records.exists() and not manifest.exists(),
        "immutable issue stage already exists",
    )
    return {
        "kind": PLAN_KIND,
        "status": "FROZEN_NO_APPLY",
        "execution_main_sha": require_clean_repo(),
        "operator_sha256": operator_sha256(),
        "issue": issue,
        "official_source_url": official_url,
        "browser_download_path": str(candidate),
        "source_scan": _scan_summary(report),
        "incoming_raw_path": str(incoming.resolve()),
        "archive_raw_path": str(archived.resolve()),
        "structured_stage_root": str(stage_root.resolve()),
        "expected_records_path": str(records.resolve()),
        "expected_manifest_path": str(manifest.resolve()),
        "original_visual_root": str(asset_root.resolve()),
        "raw_authority_drive": "F",
        "structured_stage_drive": "E",
        "structured_query_placement": "hot_global",
        "browser_download_retained": True,
        "data_engine_apply_authorized": False,
        "archive_move_authorized": False,
        "source_delete_authorized": False,
        "serving_cutover_authorized": False,
        "current_state_verified": False,
        "journal_observation_only": True,
    }


def write_json_exclusive(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(value, stream, ensure_ascii=False, sort_keys=True, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())


def authorize(plan: dict, plan_sha: str, token: str) -> None:
    issue = plan.get("issue", "")
    require(
        plan.get("kind") == PLAN_KIND
        and plan.get("status") == "FROZEN_NO_APPLY"
        and journal.ISSUE_RE.fullmatch(issue) is not None
        and validate_official_url(plan.get("official_source_url", ""), issue)
        == plan.get("official_source_url")
        and plan.get("operator_sha256") == operator_sha256()
        and plan.get("raw_authority_drive") == "F"
        and plan.get("structured_stage_drive") == "E"
        and plan.get("structured_query_placement") == "hot_global"
        and plan.get("browser_download_retained") is True
        and plan.get("data_engine_apply_authorized") is False
        and plan.get("archive_move_authorized") is False
        and plan.get("source_delete_authorized") is False
        and plan.get("serving_cutover_authorized") is False
        and plan.get("current_state_verified") is False
        and plan.get("journal_observation_only") is True,
        "acquisition frozen plan/operator mismatch",
    )
    expected = (
        f"GO #910 GB-UKIPO-OFFICIAL-ACQUIRE-STAGE {plan_sha} ISSUE-{issue}-TO-F-E"
    )
    require(token == expected, "exact acquisition/stage authority required")


def _revalidate_plan_paths(plan: dict) -> None:
    issue = plan["issue"]
    source_sha = plan["source_scan"]["zip_sha256"]
    stem = f"{issue}-{source_sha[:12]}"
    require(
        Path(plan["incoming_raw_path"]).resolve()
        == (journal.RAW_ROOT / f"{issue}.zip").resolve()
        and Path(plan["archive_raw_path"]).resolve()
        == (journal.ARCHIVE_ROOT / f"{issue}.zip").resolve()
        and Path(plan["structured_stage_root"]).resolve()
        == journal.STAGE_ROOT.resolve()
        and Path(plan["expected_records_path"]).resolve()
        == (journal.STAGE_ROOT / f"{stem}-details.jsonl").resolve()
        and Path(plan["expected_manifest_path"]).resolve()
        == (journal.STAGE_ROOT / f"{stem}-manifest.json").resolve()
        and Path(plan["original_visual_root"]).resolve()
        == journal.ASSET_ROOT.resolve(),
        "acquisition plan storage topology drift",
    )


def _admit_raw(plan: dict) -> tuple[Path, bool]:
    source = Path(plan["browser_download_path"])
    expected_sha = plan["source_scan"]["zip_sha256"]
    expected_bytes = plan["source_scan"]["zip_bytes"]
    require(
        source.is_file()
        and not source.is_symlink()
        and source.stat().st_size == expected_bytes
        and journal.sha256_file(source) == expected_sha,
        "browser download changed after plan freeze",
    )
    incoming = Path(plan["incoming_raw_path"])
    archived = Path(plan["archive_raw_path"])
    require(not archived.exists(), "issue already archived before acquisition apply")
    if incoming.exists():
        require(
            incoming.is_file()
            and not incoming.is_symlink()
            and incoming.stat().st_size == expected_bytes
            and journal.sha256_file(incoming) == expected_sha,
            "existing F incoming raw ZIP differs from frozen source",
        )
        return incoming, True

    incoming.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="wb", dir=incoming.parent, prefix=".ukipo-download-", delete=False
    ) as stream:
        temporary = Path(stream.name)
        with source.open("rb") as input_stream:
            shutil.copyfileobj(input_stream, stream, length=1024 * 1024)
        stream.flush()
        os.fsync(stream.fileno())
    try:
        require(
            temporary.stat().st_size == expected_bytes
            and journal.sha256_file(temporary) == expected_sha,
            "temporary F raw ZIP integrity check failed",
        )
        os.rename(temporary, incoming)
    finally:
        if temporary.exists():
            temporary.unlink()
    require(journal.sha256_file(incoming) == expected_sha, "F raw ZIP integrity failed")
    return incoming, False


def _stage_or_reconcile(plan: dict, incoming: Path) -> tuple[dict, bool]:
    records = Path(plan["expected_records_path"])
    manifest = Path(plan["expected_manifest_path"])
    expected_sha = plan["source_scan"]["zip_sha256"]
    if not records.exists() and not manifest.exists():
        return (
            journal.stage_zip(
                incoming, journal.STAGE_ROOT, journal.ASSET_ROOT, expected_sha
            ),
            False,
        )
    require(records.is_file() and manifest.is_file(), "partial immutable stage exists")
    observed = json.loads(manifest.read_text(encoding="utf-8"))
    require(
        observed.get("issue") == plan["issue"]
        and observed.get("zip_sha256") == expected_sha
        and observed.get("assets_staged") is True
        and Path(observed.get("records_path", "")).resolve() == records.resolve()
        and observed.get("records_sha256") == journal.sha256_file(records),
        "existing immutable stage differs from frozen plan",
    )
    report, _, assets = journal.scan_zip(incoming)
    require(_scan_summary(report) == plan["source_scan"], "staged source scan drift")
    for digest, (relative, _) in assets.items():
        target = journal.ASSET_ROOT / Path(relative)
        require(
            target.is_file() and journal.sha256_file(target) == digest,
            "existing original visual CAS differs from source",
        )
    observed["manifest_path"] = str(manifest)
    observed["manifest_sha256"] = journal.sha256_file(manifest)
    return observed, True


def apply(plan: dict, plan_sha: str) -> dict:
    require(
        current_git_head() == plan["execution_main_sha"], "execution main SHA drift"
    )
    require_clean_repo()
    _revalidate_plan_paths(plan)
    candidate = Path(plan["browser_download_path"])
    require(
        candidate.is_file()
        and not candidate.is_symlink()
        and candidate.stat().st_size == plan["source_scan"]["zip_bytes"]
        and journal.sha256_file(candidate) == plan["source_scan"]["zip_sha256"],
        "source ZIP changed after freeze",
    )
    report, _, _ = journal.scan_zip(candidate)
    require(
        _scan_summary(report) == plan["source_scan"], "source ZIP changed after freeze"
    )
    incoming, raw_reconciled = _admit_raw(plan)
    stage, stage_reconciled = _stage_or_reconcile(plan, incoming)
    receipt = {
        "kind": RECEIPT_KIND,
        "status": "OFFICIAL_RAW_ADMITTED_AND_STRUCTURED_STAGE_COMPLETE_NO_DB_APPLY",
        "plan_sha256": plan_sha,
        "execution_main_sha": plan["execution_main_sha"],
        "issue": plan["issue"],
        "official_source_url": plan["official_source_url"],
        "raw_path": str(incoming),
        "raw_sha256": plan["source_scan"]["zip_sha256"],
        "raw_bytes": plan["source_scan"]["zip_bytes"],
        "stage_manifest_path": stage["manifest_path"],
        "stage_manifest_sha256": stage["manifest_sha256"],
        "stage_records_path": stage["records_path"],
        "stage_records_sha256": stage["records_sha256"],
        "browser_download_retained": candidate.is_file(),
        "raw_reconciled": raw_reconciled,
        "stage_reconciled": stage_reconciled,
        "data_engine_applied": False,
        "raw_archived": False,
        "current_state_verified": False,
        "journal_observation_only": True,
    }
    receipt_path = GOV / f"ukipo-{plan['issue']}-official-acquire-stage-r1.json"
    if receipt_path.exists():
        existing = json.loads(receipt_path.read_text(encoding="utf-8"))
        require(
            existing.get("plan_sha256") == plan_sha
            and existing.get("raw_sha256") == receipt["raw_sha256"]
            and existing.get("stage_records_sha256") == receipt["stage_records_sha256"],
            "existing acquisition receipt drift",
        )
        receipt = existing
    else:
        write_json_exclusive(receipt_path, receipt)
    receipt["receipt_path"] = str(receipt_path)
    receipt["receipt_sha256"] = journal.sha256_file(receipt_path)
    return receipt


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--preflight-only", action="store_true")
    mode.add_argument("--freeze-plan", type=Path)
    mode.add_argument("--apply", action="store_true")
    parser.add_argument("--issue", default="")
    parser.add_argument("--official-url", default="")
    parser.add_argument("--browser-download", type=Path)
    parser.add_argument("--plan", type=Path)
    parser.add_argument("--plan-sha", default="")
    parser.add_argument("--authority-token", default="")
    args = parser.parse_args()

    if args.apply:
        require(args.plan is not None, "apply requires plan")
        require(
            re.fullmatch(r"[0-9a-f]{64}", args.plan_sha) is not None
            and journal.sha256_file(args.plan) == args.plan_sha,
            "exact acquisition plan SHA required",
        )
        plan = json.loads(args.plan.read_text(encoding="utf-8"))
        authorize(plan, args.plan_sha, args.authority_token)
        print(json.dumps(apply(plan, args.plan_sha), sort_keys=True), flush=True)
        return

    require(
        args.browser_download is not None and args.issue and args.official_url,
        "preflight/freeze requires issue, official URL and browser download",
    )
    plan = make_plan(args.issue, args.official_url, args.browser_download)
    if args.preflight_only:
        print(json.dumps(plan, sort_keys=True), flush=True)
        return
    require(
        args.freeze_plan.parent.resolve() == GOV.resolve(),
        "freeze plan must be under governed #910 directory",
    )
    write_json_exclusive(args.freeze_plan, plan)
    print(
        json.dumps(
            {
                "plan_path": str(args.freeze_plan),
                "plan_sha256": journal.sha256_file(args.freeze_plan),
                "issue": args.issue,
            },
            sort_keys=True,
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
