"""Optional same-machine media for the desktop game preview."""
from ipaddress import ip_address
from pathlib import Path

from aiohttp import web


ROUTE = "/api/game/local-art"
FILES = frozenset({"home.png", "shop.png", "field.png"} | {
    f"{layer}-{choice}.png"
    for layer in ("hair", "shirt", "pants", "skin", "shoes")
    for choice in (1, 2)
})
MAX_BYTES = 1_000_000
AUDIO_TYPES = {"opening.mp3":"audio/mpeg", "opening.ogg":"audio/ogg", "opening.wav":"audio/wav"}
MAX_AUDIO_BYTES = 24_000_000


def install(app, folder, is_integrated):
    root = Path(folder) if folder is not None else None

    def path_for(request, name):
        peer = request.transport.get_extra_info("peername") if request.transport else None
        if (root is None or name not in FILES and name not in AUDIO_TYPES or is_integrated(request)
                or not peer or not ip_address(peer[0]).is_loopback
                or root.absolute() != root.resolve()):
            return None
        file = root / name
        maximum = MAX_AUDIO_BYTES if name in AUDIO_TYPES else MAX_BYTES
        if file.is_file() and not file.is_symlink() and file.resolve().parent == root.resolve() and file.stat().st_size <= maximum:
            return file
        return None

    async def manifest(request):
        opening = next((name for name in AUDIO_TYPES if path_for(request, name)), None)
        return web.json_response({"files": [name for name in sorted(FILES) if path_for(request, name)],
                                  "openingAudio": opening})

    async def media(request):
        name = request.match_info["name"]
        path = path_for(request, name)
        if not path:
            raise web.HTTPNotFound()
        return web.FileResponse(path, headers={"Content-Type": AUDIO_TYPES.get(name, "image/png")})

    app.router.add_get(ROUTE, manifest)
    app.router.add_get(ROUTE + "/{name}", media)
