"""Local feature discovery and a no-score diagnostic for the shared speaking foundation."""
from pathlib import Path

from aiohttp import web

from daily_practice_config import load_settings
from daily_content import BUILTIN, daily_packs
from daily_practice_summary import notebook, today
from fluency_session import DEMO_PACK as CHAINS, install as install_fluency
from practice_records import Mode
from recording_window import receive_window
from slot_session import DEMO_PACK as FRAMES, install as install_slot
from word_alignment import TOKEN_LIMIT, Word, align, tokens, words_in_window


def install(app, data_dir):
    installed = {mode:path for mode, path in ((Mode.FLUENCY, CHAINS), (Mode.SLOT, FRAMES))
                 if any((BUILTIN / 'daily').glob(f'*/{path.name}'))}
    settings = load_settings(data_dir, installed)
    base = "/api/daily-practice"
    settings_root = Path(data_dir)
    daily_root = settings_root / "daily-speaking/v1"
    enabled = {mode:path for mode, path in ((Mode.FLUENCY, CHAINS), (Mode.SLOT, FRAMES))
               if settings[mode].enabled}

    async def catalog(request):
        recognizer = app.get('french_asr')
        state = await recognizer.refresh() if hasattr(recognizer, 'refresh') else None
        response = {
            "modes": {mode: {"window_seconds": config.window_seconds}
                      for mode, config in settings.items() if config.enabled},
        }
        if isinstance(state, dict):
            response['recognizer_ready'] = bool(state.get('available'))
        return web.json_response(response)

    async def notes(request):
        packs = {}
        for mode, path in enabled.items():
            try:
                packs[mode] = {key: lesson for key, (_, lesson) in daily_packs(path, path).items()}
            except (OSError, ValueError):
                packs[mode] = None
        return web.json_response({"items":notebook(daily_root, packs)})

    async def recent_today(request):
        try:
            start, end = (int(request.query[key]) for key in ("start", "end"))
        except (ValueError, KeyError) as exc:
            raise ValueError("请提供本地今天的起止时间") from exc
        if not 0 <= start < end or not 22*3600 <= end - start <= 26*3600:
            raise ValueError("本地日期范围无效")
        return web.json_response({"modes":today(settings_root, daily_root, enabled, start, end)})

    async def probe(request):
        config = settings.get(request.match_info["mode"])
        if not config or not config.enabled:
            raise web.HTTPNotFound()
        reference = request.query.get("reference", "").strip()
        if reference and (len(reference) > 600 or not 0 < len(tokens(reference)) <= TOKEN_LIMIT):
            raise ValueError("请输入一小段法语作为对照文本")
        window = await receive_window(request, config.window_seconds)
        asr = await app["french_asr"].transcribe_wav(window.wav(), word_evidence=True)
        result = {"window": window.timing(), **{key: asr[key] for key in (
            "text", "words", "speech_seconds", "speech_spans", "pause_spans",
        )}}
        if reference:
            evidence = [Word(row["text"], row["start"], row["end"], row["probability"])
                        for row in asr["words"]]
            words, boundary = words_in_window(evidence, 0, result["window"]["seconds"])
            rules = config.rules
            minimum = rules.min_word_probability if request.match_info["mode"] == Mode.FLUENCY else rules.min_frame_probability
            matches = align(reference, words, minimum)
            result["alignment"] = {
                "coverage": matches.coverage,
                "matches": [{"target": m.target, "status": m.status,
                             "probability": m.word.probability if m.word else None} for m in matches.matches],
                "boundary_words": [w.text for w in boundary],
            }
        return web.json_response(result)

    app.router.add_get(base, catalog)
    app.router.add_get(base + "/notebook", notes)
    app.router.add_get(base + "/today", recent_today)
    app.router.add_post(base + "/{mode}/probe", probe)
    install_fluency(app, data_dir, settings[Mode.FLUENCY])
    install_slot(app, data_dir, settings[Mode.SLOT])
