"""Discover shipped speaking lessons and optional locally installed packs."""
import json
from pathlib import Path

from aiohttp import web

ROOT = Path(__file__).parent
BUILTIN = ROOT / 'content/starter-speaking'


def daily_packs(primary, default_path):
    paths = [primary]
    if primary == default_path:
        paths.extend(sorted((BUILTIN / 'daily').glob(f'*/{default_path.name}')))
    lessons = {}
    for path in paths:
        if path.is_file():
            lesson = json.loads(path.read_text(encoding='utf-8'))
            lessons.setdefault(lesson['lesson_id'], (path, lesson))
    return lessons


def select_lesson(lessons, lesson_id=None):
    if not lessons:
        raise web.HTTPNotFound(text='没有安装可用的日常口语课包')
    if lesson_id is None:
        return next(iter(lessons.values()))
    if lesson_id not in lessons:
        raise ValueError('找不到这节日常口语课')
    return lessons[lesson_id]


def lesson_choices(lessons):
    return [{'id':key, 'label':lesson.get('label', key), 'title':lesson.get('title', {'zh':key})}
            for key, (_, lesson) in lessons.items()]
