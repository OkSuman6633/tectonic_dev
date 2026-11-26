"""Zero-cost persistent state sync via Google Cloud Storage (GCS) for Cloud Run.

Cloud Run container disks (/app/data, /app/generated_agents) are ephemeral and wiped on every
redeploy or scale-to-zero idle shutdown. When ``TECTONIC_GCS_BUCKET`` is configured, this module:

1. Downloads persisted state (SQLite ``tectonic.db``, auth/plan/model JSON files, generated
   agents, platform module stores, media, and ADK session DB) before the server initializes.
2. Uses ``sqlite3.Connection.backup()`` to produce a WAL-consistent snapshot of ``tectonic.db`` and
   uploads it immediately on account/subscription writes (and debounced on conversation writes).
3. Incrementally mirrors changed/deleted files under ``TECTONIC_DATA_DIR``,
   ``AGENT_BUILDER_OUTPUT_DIR``, and ``agent_builder/.adk`` to GCS, flushing synchronously on
   shutdown.

When ``TECTONIC_GCS_BUCKET`` is unset (local dev, tests), every function is a fast no-op.
"""

from __future__ import annotations

import atexit
import os
import sqlite3
import tempfile
import threading
import time
from pathlib import Path
from typing import Any, Callable

from .tracing import logger

PROJECT_ROOT = Path(__file__).resolve().parent.parent

_lock = threading.RLock()
_sync_lock = threading.Lock()
_db_timer: threading.Timer | None = None
_files_timer: threading.Timer | None = None
_bucket_override: Any = None
_synced_manifest: dict[str, tuple[int, int]] = {}
_restored = False

_SKIP_DIR_NAMES = {"__pycache__", ".pytest_cache", ".mypy_cache", "node_modules"}
_SKIP_FILE_SUFFIXES = (".pyc", ".pyo", ".tmp")


def bucket_name() -> str:
    return os.getenv("TECTONIC_GCS_BUCKET", "").strip()


def prefix() -> str:
    return (os.getenv("TECTONIC_GCS_PREFIX", "tectonic-state") or "tectonic-state").strip("/")


def is_enabled() -> bool:
    return bool(bucket_name()) or _bucket_override is not None


def set_bucket_for_tests(bucket: Any | None) -> None:
    """Inject a mock bucket in tests (pass None to restore default GCS client behavior)."""
    global _bucket_override, _restored
    with _lock:
        _bucket_override = bucket
        _synced_manifest.clear()
        _restored = False


def _get_bucket():
    if _bucket_override is not None:
        return _bucket_override
    name = bucket_name()
    if not name:
        return None
    from google.cloud import storage

    client = storage.Client()
    return client.bucket(name)


def _data_dir() -> Path:
    raw = os.getenv("TECTONIC_DATA_DIR")
    path = Path(raw) if raw else PROJECT_ROOT / "data"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _output_dir() -> Path:
    raw = os.getenv("AGENT_BUILDER_OUTPUT_DIR")
    if not raw:
        return (PROJECT_ROOT / "generated_agents").resolve()
    p = Path(raw).expanduser()
    return (p if p.is_absolute() else PROJECT_ROOT / p).resolve()


def _adk_dir() -> Path:
    return PROJECT_ROOT / "agent_builder" / ".adk"


def _blob_key(*parts: str) -> str:
    clean = "/".join(p.strip("/") for p in parts if p and p.strip("/"))
    pfx = prefix()
    return f"{pfx}/{clean}" if pfx else clean


def _snapshot_sqlite(src_path: Path, dest_path: Path) -> bool:
    """Create a WAL-consistent single-file SQLite backup."""
    if not src_path.exists():
        return False
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    src_conn = sqlite3.connect(str(src_path), timeout=20.0)
    try:
        dst_conn = sqlite3.connect(str(dest_path))
        try:
            src_conn.backup(dst_conn)
            dst_conn.commit()
        finally:
            dst_conn.close()
    finally:
        src_conn.close()
    return True


def _upload_file(bucket: Any, key: str, local_path: Path) -> None:
    blob = bucket.blob(key)
    blob.upload_from_filename(str(local_path))


def _download_blob(blob: Any, local_path: Path) -> None:
    local_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = local_path.with_name(f".{local_path.name}.dl.tmp")
    blob.download_to_filename(str(tmp))
    tmp.replace(local_path)


def _remove_wal_sidecars(db_path: Path) -> None:
    for suffix in ("-wal", "-shm", "-journal"):
        sidecar = Path(f"{db_path}{suffix}")
        try:
            if sidecar.exists():
                sidecar.unlink()
        except OSError:
            pass


def restore_state(*, force: bool = False) -> bool:
    """Download persisted DB, JSON configs, generated agents, and ADK session DB from GCS."""
    global _restored
    with _lock:
        if _restored and not force:
            return False
        bucket = _get_bucket()
        if bucket is None:
            return False
        _restored = True

    try:
        from .db import close_connections

        close_connections()
    except Exception:
        pass

    data_root = _data_dir()
    out_root = _output_dir()
    out_root.mkdir(parents=True, exist_ok=True)
    adk_root = _adk_dir()

    data_prefix = _blob_key("data") + "/"
    agents_prefix = _blob_key("generated_agents") + "/"
    adk_prefix = _blob_key("adk") + "/"
    base_prefix = prefix()
    list_prefix = f"{base_prefix}/" if base_prefix else ""

    count = 0
    manifest: dict[str, tuple[int, int]] = {}
    try:
        blobs = list(bucket.list_blobs(prefix=list_prefix))
        for blob in blobs:
            name = str(getattr(blob, "name", "") or "")
            if not name or name.endswith("/"):
                continue

            target: Path | None = None
            is_db = False
            if name.startswith(data_prefix):
                rel = name[len(data_prefix):]
                target = data_root / Path(rel)
                if rel == "tectonic.db":
                    is_db = True
            elif name.startswith(agents_prefix):
                rel = name[len(agents_prefix):]
                target = out_root / Path(rel)
            elif name.startswith(adk_prefix):
                rel = name[len(adk_prefix):]
                target = adk_root / Path(rel)
                if rel == "session.db":
                    is_db = True

            if target is None:
                continue

            if is_db:
                _remove_wal_sidecars(target)
            _download_blob(blob, target)
            try:
                st = target.stat()
                manifest[name] = (st.st_mtime_ns, st.st_size)
            except OSError:
                pass
            count += 1
    except Exception as exc:
        logger.warning("GCS state restore failed: %s", exc)
        return False

    with _lock:
        _synced_manifest.clear()
        _synced_manifest.update(manifest)

    if count:
        logger.info("GCS state restored (%d files)", count)
    return True


def _sync_sqlite_file(bucket: Any, db_path: Path, key: str) -> None:
    if not db_path.exists():
        return
    with tempfile.TemporaryDirectory(prefix="tectonic_db_snap_") as tmpdir:
        snap = Path(tmpdir) / db_path.name
        if _snapshot_sqlite(db_path, snap):
            _upload_file(bucket, key, snap)
            try:
                st = db_path.stat()
                with _lock:
                    _synced_manifest[key] = (st.st_mtime_ns, st.st_size)
            except OSError:
                pass


def sync_db_now() -> bool:
    """Immediately take a consistent SQLite backup of tectonic.db and upload it to GCS."""
    if not is_enabled():
        return False
    with _sync_lock:
        try:
            bucket = _get_bucket()
            if bucket is None:
                return False
            _sync_sqlite_file(bucket, _data_dir() / "tectonic.db", _blob_key("data", "tectonic.db"))
            return True
        except Exception as exc:
            logger.warning("GCS db sync failed: %s", exc)
            return False


def _iter_sync_files(root: Path, gcs_subprefix: str, *, skip_db_files: bool = True) -> dict[str, Path]:
    found: dict[str, Path] = {}
    if not root.exists():
        return found
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in _SKIP_DIR_NAMES]
        dp = Path(dirpath)
        for fname in filenames:
            if fname.endswith(_SKIP_FILE_SUFFIXES) or fname.startswith("."):
                continue
            if skip_db_files and (
                fname == "tectonic.db"
                or fname.startswith("tectonic.db-")
                or fname == "session.db"
                or fname.startswith("session.db-")
            ):
                continue
            fp = dp / fname
            if not fp.is_file():
                continue
            rel = fp.relative_to(root).as_posix()
            found[_blob_key(gcs_subprefix, rel)] = fp
    return found


def sync_files_now(*, include_db: bool = True) -> bool:
    """Sync modified/new/deleted files under data/, generated_agents/, and .adk/ to GCS."""
    if not is_enabled():
        return False
    with _sync_lock:
        try:
            bucket = _get_bucket()
            if bucket is None:
                return False

            if include_db:
                _sync_sqlite_file(bucket, _data_dir() / "tectonic.db", _blob_key("data", "tectonic.db"))
                adk_db = _adk_dir() / "session.db"
                if adk_db.exists():
                    _sync_sqlite_file(bucket, adk_db, _blob_key("adk", "session.db"))

            local_files: dict[str, Path] = {}
            local_files.update(_iter_sync_files(_data_dir(), "data"))
            local_files.update(_iter_sync_files(_output_dir(), "generated_agents"))

            with _lock:
                prev_manifest = dict(_synced_manifest)

            next_manifest = dict(prev_manifest)
            for key, fp in local_files.items():
                try:
                    st = fp.stat()
                except OSError:
                    continue
                sig = (st.st_mtime_ns, st.st_size)
                if prev_manifest.get(key) == sig:
                    continue
                _upload_file(bucket, key, fp)
                next_manifest[key] = sig

            # Delete remote non-DB files that were removed locally (e.g. deleted generated agents).
            managed_prefixes = (_blob_key("data") + "/", _blob_key("generated_agents") + "/")
            db_keys = {_blob_key("data", "tectonic.db"), _blob_key("adk", "session.db")}
            for old_key in list(prev_manifest):
                if old_key in db_keys:
                    continue
                if old_key.startswith(managed_prefixes) and old_key not in local_files:
                    try:
                        blob = bucket.blob(old_key)
                        if blob.exists():
                            blob.delete()
                    except Exception as exc:
                        logger.warning("GCS delete failed for %s: %s", old_key, exc)
                    next_manifest.pop(old_key, None)

            with _lock:
                _synced_manifest.clear()
                _synced_manifest.update(next_manifest)
            return True
        except Exception as exc:
            logger.warning("GCS file sync failed: %s", exc)
            return False


def _schedule(timer_attr: str, delay_s: float, fn: Callable[[], Any]) -> None:
    if not is_enabled():
        return
    with _lock:
        current = globals()[timer_attr]
        if current is not None:
            current.cancel()
        t = threading.Timer(delay_s, fn)
        t.daemon = True
        globals()[timer_attr] = t
        t.start()


def sync_db(*, immediate: bool = False) -> None:
    """Persist tectonic.db to GCS immediately or after a short debounce."""
    if not is_enabled():
        return
    if immediate:
        with _lock:
            global _db_timer
            if _db_timer is not None:
                _db_timer.cancel()
                _db_timer = None
        sync_db_now()
        return
    _schedule("_db_timer", 1.5, sync_db_now)


def schedule_files_sync(delay_s: float = 2.0) -> None:
    """Schedule a debounced sync of data/, generated_agents/, and ADK session state to GCS."""
    _schedule("_files_timer", delay_s, lambda: sync_files_now(include_db=True))


def flush() -> None:
    """Cancel pending timers and synchronously flush all local state to GCS."""
    global _db_timer, _files_timer
    with _lock:
        for attr in ("_db_timer", "_files_timer"):
            t = globals()[attr]
            if t is not None:
                t.cancel()
                globals()[attr] = None
    if is_enabled():
        sync_files_now(include_db=True)


atexit.register(flush)
