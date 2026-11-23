"""Serve optional game radio tracks from the same machine only."""
from ipaddress import ip_address
import json
from pathlib import Path
import re
import stat

from aiohttp import web

ROUTE = "/api/game/radio/default"
TYPES = {".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".wav": "audio/wav"}
FILE_NAME = re.compile(r"(\d{2,3})[-_ ]+(.+)")
MAX_BYTES = 100 * 1024 * 1024


def _safe(path, root, limit=MAX_BYTES):
    try:
        info = path.lstat()
        return (stat.S_ISREG(info.st_mode) and path.resolve() == path
                and path.parent == root and info.st_size <= limit)
    except (OSError, RuntimeError):
        return False


def _number(value):
    return type(value) in (int, float) and 0 <= value <= 86400


def install(app, folder, is_integrated):
    root = (Path(folder).absolute() / "radio") if folder is not None else None

    def allowed(request):
        peer = request.transport.get_extra_info("peername") if request.transport else None
        try:
            # Check Host as well as the peer, so a loopback reverse proxy cannot serve these files.
            return (root is not None and not is_integrated(request) and peer and ip_address(peer[0]).is_loopback
                    and request.host.rsplit(":", 1)[0] in ("127.0.0.1", "localhost", "[::1]")
                    and root.resolve() == root
                    and request.headers.get("Sec-Fetch-Site", "none") in ("same-origin", "none"))
        except (OSError, ValueError, RuntimeError):
            return False

    def catalog():
        try:
            files = sorted(root.iterdir(), key=lambda p: p.name.casefold())
        except OSError:
            return {}
        metadata = {}
        manifest = root / "tracks.json"
        if _safe(manifest, root, 256 * 1024):
            try:
                rows = json.loads(manifest.read_text(encoding="utf-8-sig"))
                if isinstance(rows, list):
                    metadata = {row["file"]: row for row in rows if isinstance(row, dict)
                                and isinstance(row.get("file"), str)}
            except (OSError, ValueError):
                pass
        tracks = {}
        for path in files:
            match = FILE_NAME.fullmatch(path.stem)
            if not match or path.suffix.lower() not in TYPES or not _safe(path, root):
                continue
            track_id = f'{int(match[1]):03d}'
            if track_id in tracks:
                continue
            row = metadata.get(path.name, {})
            title = row.get("title")
            artist = row.get("artist")
            track = {"id": track_id, "title": title[:150] if isinstance(title, str) and title.strip() else match[2],
                     "url": f"{ROUTE}/{track_id}"}
            if isinstance(artist, str):
                track["artist"] = artist[:150]
            if _number(row.get("durationSec")) and row["durationSec"] > 0:
                track["durationSec"] = row["durationSec"]
            start, end = row.get("loopStartSec"), row.get("loopEndSec")
            if _number(start) and _number(end) and start + 1 < end:
                track.update(loopStartSec=start, loopEndSec=end)
            tracks[track_id] = (track, path)
        return dict(sorted(tracks.items()))

    async def manifest(request):
        tracks = catalog() if allowed(request) else {}
        return web.json_response({"tracks": [track for track, _ in tracks.values()]},
                                 headers={"Cache-Control": "no-store"})

    async def audio(request):
        track_id = request.match_info["track"]
        entry = catalog().get(track_id) if allowed(request) and re.fullmatch(r"\d{3}", track_id) else None
        if not entry:
            raise web.HTTPNotFound()
        _, path = entry
        return web.FileResponse(path, headers={"Content-Type": TYPES[path.suffix.lower()],
                                               "Cache-Control": "private, no-store"})

    app.router.add_get(ROUTE, manifest)
    app.router.add_get(ROUTE + "/{track}", audio)
