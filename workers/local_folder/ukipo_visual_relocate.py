"""Governed UKIPO GB original-logo CAS relocation from E: to F:.

The operation is additive and resumable. It verifies every source CAS object's
content SHA-256 against its filename, copies only missing objects to F:, verifies
every target object, retains E:, and never authorizes Data Engine or serving
cutover.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from workers.local_folder.ukipo_journal import ASSET_ROOT as FUTURE_ASSET_ROOT

SOURCE_ROOT = Path(r"E:\MarkOrbitData\visual-raw\assets\raw\gb\mark-images")
TARGET_ROOT = Path(r"F:\MarkOrbitData\visual-raw\assets\raw\gb\mark-images")
GOV_ROOT = Path(r"D:\yoomarks\governed-plans\910")
ACCEPTED_AUDIT = GOV_ROOT / "ukipo-78-stage-independent-audit-r1.json"
ACCEPTED_AUDIT_SHA = "c112d15007b7afe9d0c8f5a12ceb7726d088538fb5ac089cb37c935ab4079e00"
EXPECTED_FILES = 131_210
EXPECTED_BYTES = 836_495_412
EXPECTED_SOURCE_INDEX_SHA = (
    "2aa73117b92c644548a3d1f748ad88ed8223c93fa7ce5cc802b1d453c69fde9c"
)
RECEIPT = GOV_ROOT / "ukipo-gb-original-visual-f-relocation-r1.json"
CAS_RE = re.compile(
    r"sha256/([0-9a-f]{2})/([0-9a-f]{2})/([0-9a-f]{64})\.(jpg|png|gif)\Z"
)


class UKIPOVisualRelocationError(RuntimeError):
    pass


def require(ok: bool, reason: str) -> None:
    if not ok:
        raise UKIPOVisualRelocationError(reason)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_text_sha(path: Path) -> str:
    text = path.read_text(encoding="utf-8").replace("\r\n", "\n").replace("\r", "\n")
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class CASObject:
    path: Path
    relative: str
    digest: str
    size: int


def checked_cas_objects(root: Path, *, verify_content: bool) -> list[CASObject]:
    require(root.is_dir(), f"CAS root missing: {root}")
    objects: list[CASObject] = []
    for path in sorted(item for item in root.rglob("*") if item.is_file()):
        relative = path.relative_to(root).as_posix()
        match = CAS_RE.fullmatch(relative)
        require(match is not None, f"unexpected file in CAS: {relative}")
        digest = match.group(3)
        require(
            match.group(1) == digest[:2] and match.group(2) == digest[2:4],
            f"CAS shard disagrees with digest: {relative}",
        )
        size = path.stat().st_size
        require(size > 0, f"zero-byte CAS object: {relative}")
        if verify_content:
            require(
                sha256_file(path) == digest, f"CAS content SHA mismatch: {relative}"
            )
        objects.append(
            CASObject(path=path, relative=relative, digest=digest, size=size)
        )
    return objects


def inventory(objects: Iterable[CASObject]) -> dict[str, int | str]:
    count = 0
    total = 0
    index = hashlib.sha256()
    for item in objects:
        count += 1
        total += item.size
        index.update(f"{item.relative}\0{item.size}\n".encode("utf-8"))
    return {
        "file_count": count,
        "bytes": total,
        "path_size_index_sha256": index.hexdigest(),
    }


def check_no_reparse_ancestors(path: Path) -> None:
    for ancestor in (path, *path.parents):
        if not ancestor.exists():
            continue
        require(
            not ancestor.is_symlink()
            and not (os.name == "nt" and os.path.isjunction(ancestor)),
            f"visual relocation may not traverse symlink/junction: {ancestor}",
        )


def reserve_floor(total_bytes: int) -> int:
    return (total_bytes * 30 + 99) // 100 + 64 * 1024**3


def verify_accepted_source() -> tuple[list[CASObject], dict[str, int | str]]:
    require(
        ACCEPTED_AUDIT.is_file() and sha256_file(ACCEPTED_AUDIT) == ACCEPTED_AUDIT_SHA,
        "accepted 78-issue audit identity drift",
    )
    require(
        FUTURE_ASSET_ROOT == TARGET_ROOT,
        "current UKIPO parser does not target F original-visual authority",
    )
    check_no_reparse_ancestors(SOURCE_ROOT)
    objects = checked_cas_objects(SOURCE_ROOT, verify_content=True)
    facts = inventory(objects)
    require(
        facts
        == {
            "file_count": EXPECTED_FILES,
            "bytes": EXPECTED_BYTES,
            "path_size_index_sha256": EXPECTED_SOURCE_INDEX_SHA,
        },
        f"E source CAS inventory drift: {facts}",
    )
    return objects, facts


def make_plan() -> dict:
    objects, facts = verify_accepted_source()
    del objects
    require(
        not TARGET_ROOT.exists(),
        "F target already exists; review partial state before freeze",
    )
    check_no_reparse_ancestors(TARGET_ROOT)
    disk = shutil.disk_usage(TARGET_ROOT.anchor)
    floor = reserve_floor(disk.total)
    require(
        disk.free - EXPECTED_BYTES >= floor,
        "F capacity gate failed for full additive original-visual copy",
    )
    return {
        "kind": "UKIPO_GB_ORIGINAL_VISUAL_E_TO_F_RELOCATION_PLAN_V2",
        "status": "FROZEN_ADDITIVE_COPY_NO_DELETE",
        "source_root": str(SOURCE_ROOT),
        "target_root": str(TARGET_ROOT),
        "source_file_count": facts["file_count"],
        "source_bytes": facts["bytes"],
        "source_path_size_index_sha256": facts["path_size_index_sha256"],
        "accepted_78_issue_audit_sha256": ACCEPTED_AUDIT_SHA,
        "relocation_operator_sha256": canonical_text_sha(Path(__file__)),
        "future_parser_asset_root": str(FUTURE_ASSET_ROOT),
        "target_drive": "F",
        "target_total_bytes": disk.total,
        "target_reserve_floor_bytes": floor,
        "copy_semantics": "ADDITIVE_CONTENT_ADDRESSED_RESUMABLE_COPY",
        "resume_existing_matching_objects": True,
        "verify_source_and_target_content_sha256": True,
        "source_retain_after_copy": True,
        "source_delete_authorized": False,
        "existing_target_mismatch_overwrite_authorized": False,
        "data_engine_ingest_authorized": False,
        "serving_cutover_authorized": False,
    }


def validate_plan(plan: dict, plan_sha: str, token: str) -> None:
    require(
        plan.get("kind") == "UKIPO_GB_ORIGINAL_VISUAL_E_TO_F_RELOCATION_PLAN_V2"
        and plan.get("status") == "FROZEN_ADDITIVE_COPY_NO_DELETE"
        and plan.get("source_root") == str(SOURCE_ROOT)
        and plan.get("target_root") == str(TARGET_ROOT)
        and plan.get("source_file_count") == EXPECTED_FILES
        and plan.get("source_bytes") == EXPECTED_BYTES
        and plan.get("source_path_size_index_sha256") == EXPECTED_SOURCE_INDEX_SHA
        and plan.get("accepted_78_issue_audit_sha256") == ACCEPTED_AUDIT_SHA
        and plan.get("relocation_operator_sha256") == canonical_text_sha(Path(__file__))
        and plan.get("future_parser_asset_root") == str(TARGET_ROOT)
        and plan.get("target_drive") == "F"
        and plan.get("target_reserve_floor_bytes")
        == reserve_floor(plan["target_total_bytes"])
        and plan.get("copy_semantics") == "ADDITIVE_CONTENT_ADDRESSED_RESUMABLE_COPY"
        and plan.get("resume_existing_matching_objects") is True
        and plan.get("verify_source_and_target_content_sha256") is True
        and plan.get("source_retain_after_copy") is True
        and plan.get("source_delete_authorized") is False
        and plan.get("existing_target_mismatch_overwrite_authorized") is False
        and plan.get("data_engine_ingest_authorized") is False
        and plan.get("serving_cutover_authorized") is False,
        "F relocation frozen plan/operator contract drift",
    )
    expected = (
        f"GO #910 UKIPO-GB-VISUAL-F-RELOCATE {plan_sha} ADDITIVE-COPY-VERIFY-NO-DELETE"
    )
    require(token == expected, "exact UKIPO F relocation authority required")


def copy_object(source: CASObject, target_root: Path) -> bool:
    target = target_root / Path(source.relative)
    if target.exists():
        require(
            target.is_file()
            and target.stat().st_size == source.size
            and sha256_file(target) == source.digest,
            f"existing F CAS object mismatch: {source.relative}",
        )
        return False
    target.parent.mkdir(parents=True, exist_ok=True)
    require(
        not target.exists(),
        f"target appeared before immutable copy: {source.relative}",
    )
    handle = tempfile.NamedTemporaryFile(
        prefix=source.digest + ".", suffix=".tmp", dir=target.parent, delete=False
    )
    temp = Path(handle.name)
    try:
        with source.path.open("rb") as src, handle:
            shutil.copyfileobj(src, handle, length=1024 * 1024)
            handle.flush()
            os.fsync(handle.fileno())
        require(
            temp.stat().st_size == source.size and sha256_file(temp) == source.digest,
            f"temporary F CAS verification failed: {source.relative}",
        )
        try:
            os.link(temp, target)
        except FileExistsError:
            require(
                target.is_file()
                and target.stat().st_size == source.size
                and sha256_file(target) == source.digest,
                f"raced existing F CAS object mismatch: {source.relative}",
            )
            return False
        finally:
            temp.unlink(missing_ok=True)
        return True
    finally:
        temp.unlink(missing_ok=True)


def apply_relocation(plan: dict, plan_sha: str) -> dict:
    require(not RECEIPT.exists(), "F relocation receipt already exists; refuse replay")
    source_objects, source_facts = verify_accepted_source()
    check_no_reparse_ancestors(TARGET_ROOT)
    disk = shutil.disk_usage(TARGET_ROOT.anchor)
    require(
        disk.total == plan["target_total_bytes"],
        "F volume total changed since frozen plan",
    )
    existing_bytes = 0
    if TARGET_ROOT.exists():
        existing = checked_cas_objects(TARGET_ROOT, verify_content=True)
        existing_map = {item.relative: item for item in existing}
        source_map = {item.relative: item for item in source_objects}
        require(
            set(existing_map).issubset(source_map),
            "F target contains objects outside frozen E source set",
        )
        for relative, item in existing_map.items():
            source = source_map[relative]
            require(
                item.size == source.size and item.digest == source.digest,
                f"existing F object identity drift: {relative}",
            )
            existing_bytes += item.size
    missing_bytes = EXPECTED_BYTES - existing_bytes
    require(
        missing_bytes >= 0
        and disk.free - missing_bytes >= plan["target_reserve_floor_bytes"],
        "F live capacity below frozen reserve after remaining copy projection",
    )

    copied = 0
    reused = 0
    for ordinal, source in enumerate(source_objects, 1):
        if copy_object(source, TARGET_ROOT):
            copied += 1
        else:
            reused += 1
        if ordinal % 10_000 == 0 or ordinal == EXPECTED_FILES:
            print(
                f"UKIPO_F_RELOCATION_PROGRESS checked={ordinal} "
                f"copied={copied} reused={reused}",
                flush=True,
            )

    target_objects = checked_cas_objects(TARGET_ROOT, verify_content=True)
    target_facts = inventory(target_objects)
    require(
        target_facts == source_facts,
        "F target CAS does not exactly match frozen E source",
    )
    source_after = inventory(checked_cas_objects(SOURCE_ROOT, verify_content=True))
    require(source_after == source_facts, "E source changed during additive relocation")
    disk_after = shutil.disk_usage(TARGET_ROOT.anchor)
    require(
        disk_after.free >= plan["target_reserve_floor_bytes"],
        "F free space fell below frozen reserve floor",
    )
    receipt = {
        "kind": "UKIPO_GB_ORIGINAL_VISUAL_F_RELOCATION_RECEIPT_V1",
        "status": "F_ORIGINAL_VISUAL_RELOCATION_ACCEPTED_E_RETAINED",
        "plan_sha256": plan_sha,
        "accepted_78_issue_audit_sha256": ACCEPTED_AUDIT_SHA,
        "source_root": str(SOURCE_ROOT),
        "target_root": str(TARGET_ROOT),
        "source_file_count_verified": source_facts["file_count"],
        "target_file_count_verified": target_facts["file_count"],
        "source_bytes_verified": source_facts["bytes"],
        "target_bytes_verified": target_facts["bytes"],
        "source_path_size_index_sha256": source_facts["path_size_index_sha256"],
        "target_path_size_index_sha256": target_facts["path_size_index_sha256"],
        "objects_copied_this_run": copied,
        "objects_reused_this_run": reused,
        "target_free_bytes_after": disk_after.free,
        "target_reserve_floor_bytes": plan["target_reserve_floor_bytes"],
        "source_retained": True,
        "source_deleted": False,
        "source_delete_authorized": False,
        "data_engine_ingest_authorized": False,
        "serving_cutover_authorized": False,
    }
    GOV_ROOT.mkdir(parents=True, exist_ok=True)
    with RECEIPT.open("x", encoding="utf-8") as stream:
        json.dump(receipt, stream, ensure_ascii=False, sort_keys=True, indent=2)
        stream.write("\n")
    receipt["receipt_path"] = str(RECEIPT)
    receipt["receipt_sha256"] = sha256_file(RECEIPT)
    return receipt


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--preflight-only", action="store_true")
    mode.add_argument("--freeze-plan", type=Path)
    mode.add_argument("--apply", action="store_true")
    parser.add_argument("--plan", type=Path)
    parser.add_argument("--plan-sha", default="")
    parser.add_argument("--authority-token", default="")
    args = parser.parse_args()

    if args.preflight_only:
        require(
            not args.plan and not args.authority_token,
            "preflight accepts no Apply arguments",
        )
        print(json.dumps(make_plan(), ensure_ascii=False, sort_keys=True), flush=True)
        return
    if args.freeze_plan is not None:
        require(
            not args.plan
            and not args.authority_token
            and args.freeze_plan.parent.resolve() == GOV_ROOT.resolve(),
            "freeze plan must be under governed plans",
        )
        plan = make_plan()
        args.freeze_plan.parent.mkdir(parents=True, exist_ok=True)
        with args.freeze_plan.open("x", encoding="utf-8") as stream:
            json.dump(plan, stream, ensure_ascii=False, sort_keys=True, indent=2)
            stream.write("\n")
        print(
            "UKIPO_F_RELOCATION_PLAN_SHA256=" + sha256_file(args.freeze_plan),
            flush=True,
        )
        print(
            "UKIPO_F_RELOCATION_PLAN_STATUS=FROZEN_ADDITIVE_COPY_NO_DELETE", flush=True
        )
        return

    require(
        args.plan is not None
        and re.fullmatch(r"[0-9a-f]{64}", args.plan_sha)
        and sha256_file(args.plan) == args.plan_sha,
        "exact frozen F relocation plan SHA required",
    )
    plan = json.loads(args.plan.read_text(encoding="utf-8"))
    validate_plan(plan, args.plan_sha, args.authority_token)
    result = apply_relocation(plan, args.plan_sha)
    print(json.dumps(result, ensure_ascii=False, sort_keys=True), flush=True)


if __name__ == "__main__":
    main()
