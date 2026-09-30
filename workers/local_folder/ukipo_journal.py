"""Offline UKIPO journal ZIP evidence parser and governed F: original-logo CAS pilot.

This LOCAL_FOLDER execution helper produces source-grounded handoff data only.
It does not register canonical Knowledge RawArtifact or write Data Engine.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
import shutil
import tempfile
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter
from pathlib import Path, PurePosixPath

RAW_ROOT = Path(r"F:\MarkOrbitData\raw\incoming\uk")
STAGE_ROOT = Path(r"D:\yoomarks\governed-plans\910\ukipo-journal")
ASSET_ROOT = Path(r"F:\MarkOrbitData\visual-raw\assets\raw\gb\mark-images")
ISSUE_RE = re.compile(r"20\d{2}-\d{3}\Z")
DETAIL_RE = re.compile(r"(UK|WO)\d+\.html\Z")
MEDIA_RE = re.compile(r"images/[^/\\\x00-\x1f\x7f]{1,240}\.(?:jpe?g|png|gif)\Z", re.I)
ENTITY_RE = re.compile(r"&([A-Za-z][A-Za-z0-9]+);")
SURROGATE_PAIR_RE = re.compile(r"&#(x[0-9a-fA-F]+|\d+);&#(x[0-9a-fA-F]+|\d+);")
IMAGE_ALT_RE = re.compile(r'(<img\b[^<>]*?\bclass="markimage"[^<>]*?\balt=")([^"]*)(")', re.I | re.S)
XML_ENTITIES = {"amp", "lt", "gt", "quot", "apos"}
INDEXES = ("word", "image", "class", "owner", "agent")
MAX_MEMBERS = 20_000
MAX_HTML_BYTES = 16 * 1024 * 1024
MAX_IMAGE_BYTES = 20 * 1024 * 1024
MAX_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024


class UKIPOInputError(RuntimeError):
    pass


def require(condition: bool, reason: str) -> None:
    if not condition:
        raise UKIPOInputError(reason)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def local_name(element: ET.Element) -> str:
    return element.tag.rsplit("}", 1)[-1]


def plain(element: ET.Element) -> str:
    return " ".join("".join(element.itertext()).split())


def _repair_surrogate_pair(match: re.Match[str]) -> str:
    def codepoint(value: str) -> int:
        return int(value[1:], 16) if value.startswith("x") else int(value)

    high, low = codepoint(match.group(1)), codepoint(match.group(2))
    if 0xD800 <= high <= 0xDBFF and 0xDC00 <= low <= 0xDFFF:
        return chr(0x10000 + ((high - 0xD800) << 10) + low - 0xDC00)
    return match.group(0)


def parse_xhtml(data: bytes) -> ET.Element:
    source = SURROGATE_PAIR_RE.sub(
        _repair_surrogate_pair, data.decode("utf-8-sig")
    )
    # UKIPO mark-image ALT text sometimes contains bare '<' or malformed
    # typography. Escape this display-only attribute, never the raw evidence.
    source = IMAGE_ALT_RE.sub(
        lambda match: match.group(1)
        + html.escape(html.unescape(match.group(2)), quote=True)
        + match.group(3),
        source,
    )
    normalized = ENTITY_RE.sub(
        lambda match: (
            match.group(0)
            if match.group(1) in XML_ENTITIES
            else html.unescape(match.group(0))
        ),
        source,
    )
    try:
        return ET.fromstring(normalized)
    except ET.ParseError as error:
        raise UKIPOInputError(f"journal XHTML parse failed: {error}") from error


def by_id(root: ET.Element, identifier: str) -> ET.Element | None:
    return next((node for node in root.iter() if node.get("id") == identifier), None)


def paragraphs(root: ET.Element, class_name: str) -> list[str]:
    return [
        plain(node)
        for node in root.iter()
        if local_name(node) == "p" and class_name in node.get("class", "").split()
    ]


def checked_members(archive: zipfile.ZipFile, issue: str) -> dict[str, zipfile.ZipInfo]:
    entries = archive.infolist()
    require(0 < len(entries) <= MAX_MEMBERS, "ZIP member count outside pilot bounds")
    require(
        sum(entry.file_size for entry in entries) <= MAX_UNCOMPRESSED_BYTES,
        "ZIP expanded size exceeds pilot bound",
    )
    members: dict[str, zipfile.ZipInfo] = {}
    for entry in entries:
        path = PurePosixPath(entry.filename)
        auxiliary = (
            len(path.parts) == 1
            and re.fullmatch(r"[A-Za-z0-9_.-]+\.(?:css|png|js|html|gif|jpg)", entry.filename)
            is not None
            and entry.file_size <= MAX_HTML_BYTES
        )
        issue_member = path.parts[0] == issue and len(path.parts) <= 3
        require(
            not entry.filename.startswith("/")
            and "\\" not in entry.filename
            and ".." not in path.parts
            and (auxiliary or issue_member),
            f"untrusted ZIP member name: {entry.filename!r}",
        )
        require(entry.filename not in members, "duplicate ZIP member name")
        members[entry.filename] = entry
    return members


def read_member(
    archive: zipfile.ZipFile, members: dict[str, zipfile.ZipInfo],
    name: str, limit: int,
) -> bytes:
    entry = members.get(name)
    require(entry is not None and not entry.is_dir(), f"missing ZIP evidence: {name}")
    require(0 < entry.file_size <= limit, f"ZIP member size outside bound: {name}")
    data = archive.read(entry)
    require(len(data) == entry.file_size, f"ZIP member byte count changed: {name}")
    return data


def image_suffix(data: bytes) -> str:
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return ".gif"
    raise UKIPOInputError("mark image content is not a recognized image")


def detail_record(
    archive: zipfile.ZipFile, members: dict[str, zipfile.ZipInfo],
    issue: str, name: str, zip_sha: str,
    assets: dict[str, tuple[str, bytes]],
    *, allow_missing_originals: bool = False,
) -> dict:
    data = read_member(archive, members, name, MAX_HTML_BYTES)
    document = parse_xhtml(data)
    mark = PurePosixPath(name).stem
    journal = by_id(document, "journalid")
    title = plain(journal) if journal is not None else ""
    require(f"{issue[:4]}/{issue[5:]}" in title, f"detail journal identity mismatch: {name}")
    classes = by_id(document, "classdetails")
    require(classes is not None, f"class detail missing: {name}")
    goods: list[dict[str, object]] = []
    active: dict[str, object] | None = None
    for node in classes.iter():
        tag = local_name(node)
        if tag == "dt":
            match = re.fullmatch(r"Class\s+(\d{1,2})", plain(node))
            require(match is not None and 1 <= int(match.group(1)) <= 45,
                    f"unrecognized Nice class heading: {name}")
            active = {"class": int(match.group(1)), "goods": []}
            goods.append(active)
        elif tag == "dd":
            require(active is not None, f"goods without Nice class: {name}")
            active["goods"].append(plain(node))
    require(goods and all(entry["goods"] for entry in goods), f"goods/class missing: {name}")
    images: list[dict[str, object]] = []
    for node in document.iter():
        if local_name(node) != "img" or "markimage" not in node.get("class", "").split():
            continue
        relative = node.get("src", "")
        require(MEDIA_RE.fullmatch(relative) is not None and not PurePosixPath(relative).name.startswith("tn-"),
                f"unsafe or thumbnail mark image reference: {name}: {relative}")
        declared_member = f"{issue}/{relative}"
        member_name = declared_member
        if member_name not in members:
            aliases = [candidate for candidate in members
                       if candidate.casefold() == declared_member.casefold()]
            require(len(aliases) <= 1, f"ambiguous casefold image members: {declared_member}")
            if not aliases and allow_missing_originals:
                images.append({
                    "ordinal": len(images) + 1,
                    "source_member": None, "declared_src": relative,
                    "source_member_resolution": "MISSING_SOURCE_MEMBER",
                    "sha256": None, "bytes": None, "asset_relative_path": None,
                    "thumbnail_present": f"{issue}/images/tn-{PurePosixPath(relative).name}" in members,
                })
                continue
            require(len(aliases) == 1, f"missing ZIP evidence: {declared_member}")
            member_name = aliases[0]
        raw = read_member(archive, members, member_name, MAX_IMAGE_BYTES)
        digest = hashlib.sha256(raw).hexdigest()
        suffix = image_suffix(raw)
        asset_relative = f"sha256/{digest[:2]}/{digest[2:4]}/{digest}{suffix}"
        previous = assets.get(digest)
        require(previous is None or previous[0] == asset_relative,
                "same image content cannot map to two CAS paths")
        assets[digest] = (asset_relative, raw)
        images.append({
            "ordinal": len(images) + 1, "source_member": member_name,
            "declared_src": relative,
            "source_member_resolution": "EXACT" if member_name == declared_member
            else "UNIQUE_CASEFOLD_ALIAS",
            "sha256": digest, "bytes": len(raw),
            "asset_relative_path": asset_relative,
            "thumbnail_present": f"{issue}/images/tn-{PurePosixPath(relative).name}" in members,
        })
    regdate = by_id(document, "regdate")
    return {
        "kind": "UKIPO_JOURNAL_DETAIL_STAGE_V1",
        "issue": issue, "mark_id": mark, "mark_family": mark[:2],
        "source_zip_sha256": zip_sha, "source_member": name,
        "detail_html_sha256": hashlib.sha256(data).hexdigest(),
        "journal_title_raw": title,
        "regdate_raw": plain(regdate) if regdate is not None else None,
        "mark_text": paragraphs(document, "marktext"),
        "applicants": paragraphs(document, "applicant"),
        "representatives": paragraphs(document, "representative"),
        "goods_by_class": goods, "mark_images": images,
        "image_evidence_complete": all(image["source_member"] is not None for image in images),
        "source_markup_repairs": [
            repair
            for repair, active in (
                ("SURROGATE_NUMERIC_PAIR", SURROGATE_PAIR_RE.search(data.decode("utf-8-sig")) is not None),
                ("MALFORMED_IMAGE_ALT", any(
                    "<" in match.group(2) or ">" in match.group(2)
                    for match in IMAGE_ALT_RE.finditer(data.decode("utf-8-sig"))
                )),
            )
            if active
        ],
    }


def scan_zip(
    path: Path, *, allow_missing_originals: bool = False,
) -> tuple[dict, list[dict], dict[str, tuple[str, bytes]]]:
    issue = path.stem
    require(ISSUE_RE.fullmatch(issue) is not None, "ZIP filename is not a journal issue")
    zip_sha = sha256_file(path)
    with zipfile.ZipFile(path) as archive:
        members = checked_members(archive, issue)
        word = read_member(archive, members, f"{issue}/word.html", MAX_HTML_BYTES)
        match = re.search(rb"Domestic Journal Number (\d{4})/(\d{3})", word[:5000])
        require(match is not None and match.group(1).decode() + "-" + match.group(2).decode() == issue,
                "ZIP filename disagrees with its journal issue")
        detail_names = sorted(
            name for name in members
            if len(PurePosixPath(name).parts) == 2
            and DETAIL_RE.fullmatch(PurePosixPath(name).name)
        )
        require(detail_names, "ZIP has no trademark detail pages")
        mark_ids = {PurePosixPath(name).stem for name in detail_names}
        require(len(mark_ids) == len(detail_names), "duplicate trademark detail identity")
        indexes: dict[str, dict[str, int]] = {}
        for index in INDEXES:
            raw = read_member(archive, members, f"{issue}/{index}.html", MAX_HTML_BYTES)
            tree = parse_xhtml(raw)
            linked = [
                PurePosixPath(node.get("href", "")).stem
                for node in tree.iter()
                if local_name(node) == "a"
                and DETAIL_RE.fullmatch(node.get("href", "")) is not None
            ]
            require(set(linked) <= mark_ids, f"{index} index references missing details")
            indexes[index] = {"links": len(linked), "unique_marks": len(set(linked)),
                              "missing_detail_coverage": len(mark_ids - set(linked))}
        require(indexes["class"]["missing_detail_coverage"] == 0
                and indexes["owner"]["missing_detail_coverage"] == 0,
                "class/owner index does not cover every detail page")
        assets: dict[str, tuple[str, bytes]] = {}
        details = [
            detail_record(
                archive, members, issue, name, zip_sha, assets,
                allow_missing_originals=allow_missing_originals,
            )
            for name in detail_names
        ]
    image_counts = Counter(len(item["mark_images"]) for item in details)
    unresolved = [
        {"mark": record["mark_id"], "declared": f"{issue}/{image['declared_src']}"}
        for record in details for image in record["mark_images"]
        if image["source_member_resolution"] == "MISSING_SOURCE_MEMBER"
    ]
    report = {
        "kind": "UKIPO_JOURNAL_PILOT_MANIFEST_V1",
        "issue": issue, "zip_filename": path.name, "zip_sha256": zip_sha,
        "zip_bytes": path.stat().st_size, "detail_count": len(details),
        "domestic_details": sum(x["mark_family"] == "UK" for x in details),
        "madrid_details": sum(x["mark_family"] == "WO" for x in details),
        "index_coverage": indexes, "mark_image_counts": dict(sorted(image_counts.items())),
        "mark_image_links": sum(len(x["mark_images"]) for x in details),
        "image_casefold_alias_links": sum(
            image["source_member_resolution"] == "UNIQUE_CASEFOLD_ALIAS"
            for record in details for image in record["mark_images"]
        ),
        "source_markup_repairs": dict(Counter(
            repair for record in details for repair in record["source_markup_repairs"]
        )),
        "unique_original_images": len(assets),
        "unique_original_image_bytes": sum(len(data) for _, data in assets.values()),
        "missing_original_image_links": len(unresolved),
        "missing_original_image_refs": unresolved,
        "image_evidence_complete": not unresolved,
        "assets_staged": False, "data_engine_ingested": False,
        "canonical_raw_artifact_published": False,
    }
    return report, details, assets


def stage_zip(
    path: Path, stage_root: Path, asset_root: Path, expected_sha: str,
    *, approved_missing: set[tuple[str, str]] | None = None,
    approved_audit_sha: str | None = None,
) -> dict:
    require(re.fullmatch(r"[0-9a-f]{64}", expected_sha) is not None, "expected ZIP SHA required")
    require(sha256_file(path) == expected_sha, "ZIP changed since reviewed preflight")
    report, details, assets = scan_zip(path, allow_missing_originals=approved_missing is not None)
    require(report["zip_sha256"] == expected_sha, "source ZIP changed during pilot scan")
    if approved_missing is not None:
        require(approved_missing and approved_audit_sha is not None,
                "nonempty exact missing-image audit approval required")
        observed = {(item["mark"], item["declared"])
                    for item in report["missing_original_image_refs"]}
        require(observed == approved_missing,
                "missing original image evidence differs from accepted audit")
        report["approved_missing_image_audit_sha256"] = approved_audit_sha
    stem = f"{report['issue']}-{expected_sha[:12]}"
    records_path = stage_root / f"{stem}-details.jsonl"
    manifest_path = stage_root / f"{stem}-manifest.json"
    require(not records_path.exists() and not manifest_path.exists(),
            "immutable pilot output already exists; refuse overwrite")
    for ancestor in (asset_root, *asset_root.parents):
        if ancestor.exists():
            require(
                not ancestor.is_symlink()
                and not (os.name == "nt" and os.path.isjunction(ancestor)),
                "mark-image storage may not traverse a symlink/junction",
            )
    if os.name == "nt" and asset_root == ASSET_ROOT:
        disk = shutil.disk_usage(asset_root.anchor)
        expected_new_bytes = report["unique_original_image_bytes"]
        require(
            disk.free - expected_new_bytes >= (disk.total * 30 + 99) // 100
            + 64 * 1024 * 1024 * 1024,
            "F: disk reserve admission failed (30% + 64 GiB buffer)",
        )
    stage_root.mkdir(parents=True, exist_ok=True)
    for digest, (relative, raw) in sorted(assets.items()):
        target = asset_root / Path(relative)
        if target.exists():
            require(target.is_file() and sha256_file(target) == digest,
                    f"existing CAS object mismatch: {target}")
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(mode="wb", dir=target.parent, prefix=".ukipo-", delete=False) as tmp:
            temp = Path(tmp.name)
            tmp.write(raw)
            tmp.flush()
            os.fsync(tmp.fileno())
        try:
            require(sha256_file(temp) == digest, "temporary CAS bytes drift")
            if target.exists():
                require(sha256_file(target) == digest, "CAS object raced with different bytes")
                temp.unlink()
            else:
                os.rename(temp, target)
        finally:
            if temp.exists():
                temp.unlink()
    for digest, (relative, _) in assets.items():
        require(sha256_file(asset_root / Path(relative)) == digest,
                "staged F: mark image integrity check failed")
    with records_path.open("x", encoding="utf-8", newline="\n") as stream:
        for item in details:
            stream.write(json.dumps(item, ensure_ascii=False, sort_keys=True) + "\n")
        stream.flush()
        os.fsync(stream.fileno())
    report["assets_staged"] = True
    report["asset_root"] = str(asset_root)
    report["records_path"] = str(records_path)
    report["records_sha256"] = sha256_file(records_path)
    report["source_path"] = str(path)
    with manifest_path.open("x", encoding="utf-8", newline="\n") as stream:
        json.dump(report, stream, ensure_ascii=False, sort_keys=True, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    report["manifest_path"] = str(manifest_path)
    report["manifest_sha256"] = sha256_file(manifest_path)
    return report


def approved_missing_images(
    audit_path: Path, audit_sha: str, issue: str, zip_path: Path,
) -> set[tuple[str, str]]:
    require(re.fullmatch(r"[0-9a-f]{64}", audit_sha) is not None,
            "exact missing-image audit SHA required")
    require(audit_path.is_file() and sha256_file(audit_path) == audit_sha,
            "missing-image audit SHA changed")
    audit = json.loads(audit_path.read_text(encoding="utf-8"))
    require(audit.get("kind") == "UKIPO_MISSING_IMAGE_AUDIT_V1",
            "unexpected missing-image audit version")
    matches = [item for item in audit.get("issues", []) if item.get("issue") == issue]
    require(len(matches) == 1 and matches[0].get("zip_sha256") == sha256_file(zip_path),
            "approved missing-image audit does not bind exact ZIP")
    rows = matches[0].get("missing", [])
    require(rows and len(rows) == matches[0].get("missing_original_links"),
            "approved audit must enumerate every missing image")
    pairs: set[tuple[str, str]] = set()
    for row in rows:
        mark, declared = row.get("mark"), row.get("declared")
        require(isinstance(mark, str) and DETAIL_RE.fullmatch(mark + ".html") is not None
                and isinstance(declared, str) and declared.startswith(issue + "/")
                and MEDIA_RE.fullmatch(declared[len(issue) + 1:]) is not None,
                "invalid approved mark or original-image member")
        pairs.add((mark, declared))
    require(len(pairs) == len(rows), "duplicate missing-image audit references")
    return pairs


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--issue", default="2026-033")
    parser.add_argument("--preflight-only", action="store_true")
    parser.add_argument("--stage", action="store_true")
    parser.add_argument("--expected-sha", default="")
    parser.add_argument("--missing-media-audit", type=Path)
    parser.add_argument("--missing-media-audit-sha", default="")
    args = parser.parse_args()
    require(args.preflight_only != args.stage, "select exactly one operation")
    require(ISSUE_RE.fullmatch(args.issue) is not None, "invalid issue")
    require(bool(args.missing_media_audit) == bool(args.missing_media_audit_sha),
            "missing-image exception requires both audited path and exact SHA")
    path = RAW_ROOT / f"{args.issue}.zip"
    require(path.is_file(), "journal ZIP absent")
    approved = (
        approved_missing_images(args.missing_media_audit, args.missing_media_audit_sha,
                                args.issue, path)
        if args.missing_media_audit else None
    )
    if args.preflight_only:
        report, _, _ = scan_zip(path, allow_missing_originals=approved is not None)
        if approved is not None:
            require({(entry["mark"], entry["declared"])
                     for entry in report["missing_original_image_refs"]} == approved,
                    "missing original image evidence differs from accepted audit")
            report["approved_missing_image_audit_sha256"] = args.missing_media_audit_sha
        print(json.dumps(report, ensure_ascii=False, sort_keys=True), flush=True)
        return
    report = stage_zip(
        path, STAGE_ROOT, ASSET_ROOT, args.expected_sha,
        approved_missing=approved, approved_audit_sha=args.missing_media_audit_sha or None,
    )
    print(json.dumps(report, ensure_ascii=False, sort_keys=True), flush=True)


if __name__ == "__main__":
    main()
