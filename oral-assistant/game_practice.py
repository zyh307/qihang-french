"""Tag a normal scoring session as a resumable, bounded game round."""
from aiohttp import web


NODES = {"lecture": "rift-west", "fluency": "rift-center", "slot": "rift-east"}


def adventure_request(store, body, mode):
    if body.get("origin") != "game":
        return None, None
    run_id = body.get("runId")
    node = body.get("nodeId")
    if (node != NODES[mode] or not isinstance(run_id, str)
            or body.get("review") or body.get("warmup") or body.get("steps") is not None):
        raise ValueError("冒险入口无效")
    folder = store.folder(run_id)
    game = {"origin":"game", "nodeId":node, "mode":mode, "runId":run_id}
    if not (folder / "session.json").is_file():
        return game, None
    previous = store.load(run_id)
    if previous.get("game") != game:
        raise web.HTTPConflict(text="冒险会话编号冲突")
    return game, previous


def tag(session, game):
    if game:
        session.update(id=game["runId"], game=game)
