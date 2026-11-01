#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 Inspire 1 语法整理（docx）转成结构化题库 JSON。

用法：
    python scripts/build-grammar.py <docx根目录> <输出json>
docx 根目录下应有 Unite1..Unite4 子目录。

输出：单元 → 课次 → 语法点（规则/形式/例句/易错/一句话记住），
技巧课额外带产出检查清单，单元小结带 Expressions utiles 原句速览。
这些结构供 src/components/GrammarMode.vue 直接使用。
"""
import json
import os
import re
import sys

import docx
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph

SECTION_MARKS = [
    ("raw", "教材原文"),
    ("rule", "规则"),
    ("form", "形式"),
    ("example", "例句"),
    ("mistake", "中文学习者易错"),
    ("hook", "一句话记住"),
]

UNIT_TITLES = {
    "Unite1": "DÉCOUVREZ !",
    "Unite2": "ENTREZ EN CONTACT !",
    "Unite3": "FAITES CONNAISSANCE",
    "Unite4": "ORGANISEZ UNE SORTIE",
}

LESSON_KIND = {"L7": "technique", "L11": "technique", "Summary": "summary"}

GAP = re.compile(r"[\u3000]{2,}|\s{2,}")


def iter_blocks(document):
    body = document.element.body
    for child in body.iterchildren():
        if child.tag == qn("w:p"):
            yield Paragraph(child, document)
        elif child.tag == qn("w:tbl"):
            yield Table(child, document)


def clean(text):
    return re.sub(r"[ \t\u00a0]+", " ", text.replace("\u3000", "\u3000")).strip()


def split_pair(line):
    """把「Bonjour Madame !　　　您好！」拆成 (法语, 中文)。"""
    parts = [p.strip() for p in GAP.split(line) if p.strip()]
    if len(parts) >= 2:
        return parts[0], parts[-1]
    return line, ""


def parse_mistake(line):
    """× 错误 → √ 正确　　解释"""
    m = re.match(r"^[×xX]\s*(.+?)\s*(?:→|->)\s*[√✓]\s*(.+)$", line)
    if not m:
        return None
    wrong = clean(m.group(1))
    rest = clean(m.group(2))
    parts = [p.strip() for p in GAP.split(rest) if p.strip()]
    if len(parts) >= 2:
        return {"wrong": wrong, "right": parts[0], "why": parts[-1]}
    # 没有用空白分隔时，退化为「正确答案 + 中文说明」按句号切分
    m2 = re.match(r"^(.*?[.!?])\s*(.*)$", rest)
    if m2 and re.search(r"[\u4e00-\u9fff]", m2.group(2)):
        return {"wrong": wrong, "right": clean(m2.group(1)), "why": clean(m2.group(2))}
    return {"wrong": wrong, "right": rest, "why": ""}


def parse_lesson(path, lesson_id, unit_id):
    document = docx.Document(path)
    kind = LESSON_KIND.get(lesson_id, "grammar")

    title = ""
    subtitle = ""
    points = []
    checklist = []
    uses = []
    phrases = []

    current = None
    section = None
    in_uses = False
    in_checklist = False
    summary_section = None

    for block in iter_blocks(document):
        if isinstance(block, Table):
            rows = []
            for row in block.rows:
                cells = [c.text.strip() for c in row.cells]
                if len(cells) >= 2 and cells[0] and cells[0] != "法语":
                    rows.append([clean(cells[0]), clean(cells[1])])
            if not rows or current is None:
                continue
            if section == "form" and not current["forms"]:
                current["forms"] = rows
            elif not current["examples"]:
                current["examples"] = rows
            elif not current["forms"]:
                current["forms"] = rows
            continue

        text = clean(block.text)
        if not text:
            continue

        if text.startswith("Inspire 1"):
            continue

        if not title:
            m = re.match(r"^Leçon\s*(\d+)\s*(.*)$", text)
            if m:
                title = f"Leçon {m.group(1)}"
                subtitle = clean(m.group(2))
                continue
            if text.endswith("单元小结"):
                title = re.sub(r"\s+", " ", text).strip()
                continue

        if title and not subtitle and kind == "summary" and text.startswith("Faites le point"):
            subtitle = text
            continue

        if title and not subtitle and kind != "summary" and len(text) <= 60 and not text.isupper() and not re.match(r"^\d+[.、]", text) and not text.startswith(("本课", "语法点", "覆盖课次", "语法范围", "本单元主题", "一、", "■")):
            if not re.search(r"[\u4e00-\u9fff]$", text) or re.match(r"^[A-Za-zÀ-ÿ]", text):
                subtitle = text
                continue

        # 技巧课：产出检查清单
        if text.startswith("产出检查清单"):
            in_checklist = True
            in_uses = False
            continue
        if in_checklist and text.startswith(("□", "☐", "√")):
            checklist.append(re.sub(r"^[□☐√]\s*", "", text))
            continue
        if in_checklist and not text.startswith("□") and len(checklist) > 2:
            in_checklist = False

        if text.startswith("本课会用到前面哪些语法"):
            in_uses = True
            continue

        # 语法点标题
        m = re.match(r"^语法点\s*(\d+)\s*(.*)$", text)
        if m:
            in_uses = False
            current = {
                "id": f"{lesson_id}-{m.group(1)}",
                "n": int(m.group(1)),
                "title": clean(m.group(2)),
                "raw": "",
                "label": "",
                "rules": [],
                "forms": [],
                "examples": [],
                "mistakes": [],
                "hook": "",
            }
            points.append(current)
            section = None
            continue

        if in_uses and current is None:
            if len(text) > 4 and not text.startswith(("产出检查", "做完")):
                uses.append(text)
            continue

        if current is None:
            # 单元小结：Expressions utiles 原句
            if kind == "summary":
                if text.startswith("■"):
                    summary_section = re.sub(r"^■\s*\d+\.\s*", "", text).strip()
                    continue
                fr, zh = split_pair(text)
                if fr and zh and len(fr) < 80:
                    phrases.append({"section": summary_section or "", "fr": fr, "zh": zh})
            continue

        mark = None
        for key, label in SECTION_MARKS:
            if text.startswith("■") and label in text:
                mark = key
                break
        if mark:
            section = mark
            continue

        if section == "raw":
            if not current["raw"]:
                current["raw"] = text
            elif text.startswith("定位"):
                current["label"] = text
            elif not current["label"]:
                current["label"] = text
            continue
        if section == "rule":
            current["rules"].append(text)
            continue
        if section == "mistake":
            item = parse_mistake(text)
            if item:
                current["mistakes"].append(item)
            continue
        if section == "hook":
            current["hook"] = (current["hook"] + " " + text).strip()
            continue

    # 表格被当成例句后又当形式表的兜底去重
    for p in points:
        if p["forms"] and p["forms"] == p["examples"]:
            p["examples"] = []

    return {
        "id": lesson_id,
        "title": title or lesson_id,
        "subtitle": subtitle,
        "kind": kind,
        "points": points,
        "checklist": checklist,
        "uses": uses,
        "phrases": phrases,
    }


def order_key(lesson):
    m = re.match(r"L(\d+)", lesson["id"])
    if m:
        return (0, int(m.group(1)))
    return (1, 0)


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "."
    out = sys.argv[2] if len(sys.argv) > 2 else "src/grammar/grammar-data.json"

    units = []
    for dirname in sorted(os.listdir(root)):
        unit_dir = os.path.join(root, dirname)
        if not os.path.isdir(unit_dir) or not dirname.lower().startswith("unite"):
            continue
        unit_id = "U" + re.sub(r"\D", "", dirname)
        lessons = []
        for fname in sorted(os.listdir(unit_dir)):
            if not fname.endswith(".docx") or fname.startswith("~$"):
                continue
            m = re.match(r"^U\d+_(L\d+|Summary)", fname)
            if not m:
                continue
            lessons.append(parse_lesson(os.path.join(unit_dir, fname), m.group(1), unit_id))
        lessons.sort(key=order_key)
        units.append({"id": unit_id, "title": UNIT_TITLES.get(dirname, ""), "lessons": lessons})

    data = {
        "source": "Inspire 1 · Grammaire L1–L14",
        "units": units,
    }

    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))

    pts = [p for u in units for l in u["lessons"] for p in l["points"]]
    print(
        f"units={len(units)} lessons={sum(len(u['lessons']) for u in units)} "
        f"points={len(pts)} examples={sum(len(p['examples']) for p in pts)} "
        f"mistakes={sum(len(p['mistakes']) for p in pts)} "
        f"checklist={sum(len(l['checklist']) for u in units for l in u['lessons'])} "
        f"phrases={sum(len(l['phrases']) for u in units for l in u['lessons'])} -> {out}"
    )


if __name__ == "__main__":
    main()
