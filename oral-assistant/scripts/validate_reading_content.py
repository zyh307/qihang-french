"""Validate the approved editorial schema against the index and original, full-length PCM files."""
import argparse
from hashlib import sha256
from collections import Counter
import json
import math
from pathlib import Path
import re
import sys
import unicodedata
import wave

INDEX = Path(__file__).resolve().parents[1] / "content/inspire1/lesson-index.json"
LABELS = (
    "每句 4–14 词", "时间合法、按序、位于原轨范围内", "句长之和与所选原声相差不超过 10%",
    "中文意译存在且区别于原文", "本课法语句不重复", "无占位符", "对话有角色、短文无角色",
    "难词最多三个且来自本句", "状态及来源有效", "课号、单元、句号与索引一致",
)
WORD = re.compile(r"[^\W_]+(?:['’\-][^\W_]+)*", re.UNICODE)

def words(text):
    return WORD.findall(unicodedata.normalize("NFC",text).casefold().replace("’","'"))

def read(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))

def text_digest(parts):
    return sha256(" ".join(t for part in parts for t in words(part)).encode("utf8")).hexdigest()

def index_rows(index):
    rows = {}
    tracks = index["audio_catalog"]
    if [t["piste"] for t in tracks] != list(range(1,167)):
        raise ValueError("P1–166 必须各出现一次并按编号排序")
    if [u["unit"] for u in index["units"]] != list(range(1,9)):
        raise ValueError("缺少单元或顺序有误")
    for u in index["units"]:
        for row in u["lessons"]:
            n = row["lesson"]
            if row["id"] != f"L{n}" or n in rows or not row["evidence"]["observation"]:
                raise ValueError(f"L{n} 编号或依据不完整")
            assigned = [t for t in tracks if t["lesson"]==n]
            if (row["pistes"] != [t["piste"] for t in assigned] or
                row["reading_pistes"] != [t["piste"] for t in assigned if t["role"] in ("reading","supplementary_reading")] or
                row["vocabulary_pistes"] != [t["piste"] for t in assigned if t["role"]=="vocabulary"]):
                raise ValueError(f"L{n} 音轨角色冲突")
            if row["has_text"] != (row["text_type"] in ("texte","dialogue")):
                raise ValueError(f"L{n} 正文类型冲突")
            if row["suggested_piste"] is not None and row["suggested_piste"] not in row["reading_pistes"]:
                raise ValueError(f"L{n} 首选音轨不属于本课原文")
            if row["has_text"] and not row["reading_pistes"] and not (row["status"]=="blocked" and row["missing"]):
                raise ValueError(f"L{n} 缺原声必须登记")
            rows[n] = (u["unit"],row)
    if list(rows)!=list(range(1,32)) or any(t["lesson"] is not None and t["lesson"] not in rows for t in tracks):
        raise ValueError("编号课必须为 L1–L31")
    if index["unassigned_pistes"] != [t["piste"] for t in tracks if t["lesson"] is None]:
        raise ValueError("非课次音轨不一致")
    return rows

def number(n):
    return type(n) in (int,float) and math.isfinite(n)

def validate(pack, unit, lesson, audio_dir, references=None):
    issues = [[] for _ in LABELS]
    def check(k, condition, description):
        if not condition: issues[k-1].append(description)
    meta, audio = pack.get("meta",{}), pack.get("audio",{})
    rows = pack.get("sentences",[])
    source = meta.get("source","")
    status = meta.get("status")
    check(9, status in ("verified","asr_draft","blocked") and isinstance(source,str) and
          re.fullmatch(r"(?:textbook_p\d+|guide_p\d+|transcript_p\d+|asr:piste\d+)(?:[-–]\d+)?",source), "状态或来源定位符")
    check(9, status!="verified" or not source.startswith("asr:"), "ASR 草稿不可标 verified")
    kind, pid = pack.get("type"), lesson["id"]
    integral = meta.get("scope") == "full"
    if integral:
        ref = (references or {}).get(pid,{})
        check(10, ref.get("piste")==audio.get("full") and
              ref.get("sha256")==text_digest(r.get("fr","") for r in rows),
              "逐词顺序或全文指纹与独立原文不一致")
    check(10, pack.get("id")==pid and pack.get("lesson")==lesson["lesson"] and pack.get("unit")==unit and
          lesson["has_text"],"课号、单元或收录范围")
    check(10,isinstance(rows,list) and bool(rows) and meta.get("sentence_count")==len(rows),"句数或空课文")
    check(7,kind in ("dialogue","texte"),"文体")
    full=audio.get("full","")
    track=re.fullmatch(r"P([1-9]\d*)",full) if isinstance(full,str) else None
    k=int(track[1]) if track else 0
    if source.startswith("transcript_p"):
        citation=meta.get("transcription",{})
        check(9,bool(citation.get("file")) and citation.get("piste")==k
              and isinstance(citation.get("start_line"),int) and citation["start_line"]>0,
              "教材配套转写须定位到文件、行和原轨")
    check(2,k in lesson["reading_pistes"],"音轨须为本课已核实的语篇")
    if status=="asr_draft":check(9,source==f"asr:piste{k}","草稿来源与音轨不一致")
    duration=0
    try:
        with wave.open(str(audio_dir / f"{k:03}.wav"),"rb") as w:
            duration=w.getnframes()/w.getframerate()
            check(2,(w.getnchannels(),w.getsampwidth(),w.getframerate())==(1,2,16000),"需完整 16 kHz 单声道 PCM16 WAV")
    except (OSError, EOFError, wave.Error):
        check(2,False,f"未能读取原轨 {k:03}.wav")
    def interval(x):
        a,b=x.get("start"),x.get("end")
        if x.get("piste")==full and number(a) and number(b) and 0<=a<b<=duration:
            return a,b
    spans=[]
    for seg in audio.get("segments",[]):
        pair=interval(seg)
        if pair and (not spans or pair[0]>=spans[-1][1]):spans.append(pair)
        else:check(2,False,"整段范围无效或重叠")
    check(3,bool(spans),"缺独立核定的整段起止点")
    prev=total=0
    seen=set()
    for i,r in enumerate(rows,1):
        sid=f"{pid}-S{i:02}"
        fr,zh=r.get("fr",""),r.get("zh","")
        ts=words(fr)
        check(10,r.get("id")==sid,sid)
        check(1,(1 if integral else 4)<=len(ts)<=14,f"{sid}（{len(ts)}词）")
        pair=interval(r.get("audio",{}))
        check(2,pair and pair[0]>=prev and any(a<=pair[0]<pair[1]<=b for a,b in spans),sid)
        if pair:prev=pair[1];total+=pair[1]-pair[0]
        check(4,isinstance(zh,str) and re.search(r"[\u3400-\u9fff]",zh) and zh.strip()!=fr.strip(),sid)
        key=tuple(ts)
        if not integral:check(5,key not in seen,sid)
        seen.add(key)
        check(7,isinstance(r.get("speaker"),str) and bool(r["speaker"].strip()) if kind=="dialogue" else "speaker" not in r,sid)
        hard=r.get("hard_words")
        sentence=" "+" ".join(ts)+" "
        check(8,isinstance(hard,list) and len(hard)<=3 and all(isinstance(h,str) and words(h) and
              " "+" ".join(words(h))+" " in sentence for h in hard),sid)
        if not isinstance(r.get("variants"),list) or not all(isinstance(v,str) and v.strip() for v in r["variants"]):
            check(6,False,sid+" variants 格式")
    def strings(obj):
        if isinstance(obj,str):yield obj
        elif isinstance(obj,dict):
            for v in obj.values():yield from strings(v)
        elif isinstance(obj,list):
            for v in obj:yield from strings(v)
    for value in strings(pack):
        check(6,not re.search(r"\b(?:xxx+|todo)\b|^\s*(?:…+|\.{3,})\s*$",value,re.I),"占位 "+value[:32])
    selected=sum(b-a for a,b in spans)
    declared=meta.get("total_seconds")
    check(3,selected>0 and number(declared) and abs(declared-selected)<=.05 and abs(total-selected)<=.10*selected+1e-8,
          f"句子 {total:.2f}s / 原声选段 {selected:.2f}s")
    return issues

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--index",type=Path,default=INDEX)
    run=p.add_mutually_exclusive_group(required=True)
    run.add_argument("--index-only",action="store_true")
    run.add_argument("--unit",type=int,choices=range(1,9))
    p.add_argument("--packs",type=Path)
    p.add_argument("--audio",type=Path)
    p.add_argument("--references",type=Path,help="全文原文指纹清单")
    args=p.parse_args()
    rows=index_rows(read(args.index))
    references=read(args.references) if args.references else {}
    if args.index_only:
        print("8 units / 31 lessons / 166 tracks",dict(Counter((r["has_text"],r["status"]) for _,r in rows.values())))
        return 0
    if not (args.packs and args.audio):p.error("--unit 需要 --packs 和 --audio")
    failed=False
    for u,r in rows.values():
        if u!=args.unit or not r["has_text"]:continue
        path=args.packs/(r["id"]+".json")
        if not path.is_file():
            print(r["id"],"blocked" if r["status"]=="blocked" else "missing",r.get("missing","缺课文包"));failed=True;continue
        data=read(path)
        issues=validate(data,u,r,args.audio,references)
        print(r["id"],data["meta"]["status"],len(data["sentences"]),"句",data["meta"].get("total_seconds"),"秒")
        labels=list(LABELS)
        if data.get("meta",{}).get("scope")=="full":
            labels[0]="每段 1–14 词，保留简短原话"
            labels[4]="重复话轮按原文保留（与第 10 项合检）"
            labels[9]="课号、句号、独立全文指纹与词序一致"
        for label,errors in zip(labels,issues):
            print("  "+("✗" if errors else "✓"),label,"；".join(errors))
        failed |= any(issues) or data["meta"]["status"]!="verified"
    return int(failed)
if __name__=="__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    raise SystemExit(main())
