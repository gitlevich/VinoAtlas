#!/usr/bin/env python3
"""Fetch a YouTube video's captions into transcripts/<video_id>.<lang>.md.

Usage:
    python scripts/fetch_transcript.py <url-or-video-id> [--lang ru [--lang en]] [--out PATH]

Requires an unrestricted network (run on a laptop, not a sandboxed CI box) and:
    pip install "youtube-transcript-api>=1.0" requests

Picks a manually-created caption track when one exists, otherwise the first
auto-generated one; --lang overrides with an ordered preference list. The text
is written unedited except for whitespace: caption line breaks become spaces
and paragraphs are broken at sentence boundaries for readability.
"""

import argparse
import datetime
import re
import sys
from pathlib import Path

import requests

WATCH_URL = "https://www.youtube.com/watch?v={vid}"


def video_id(s: str) -> str:
    m = re.search(r"(?:v=|youtu\.be/|shorts/|embed/|live/)([A-Za-z0-9_-]{11})", s)
    if m:
        return m.group(1)
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", s):
        return s
    sys.exit(f"cannot find a video id in {s!r}")


def metadata(vid: str) -> tuple[str, str]:
    """Title and channel via oEmbed; empty strings if unavailable."""
    try:
        r = requests.get(
            "https://www.youtube.com/oembed",
            params={"url": WATCH_URL.format(vid=vid), "format": "json"},
            timeout=15,
        )
        r.raise_for_status()
        d = r.json()
        return d.get("title", ""), d.get("author_name", "")
    except Exception:
        return "", ""


def paragraphize(text: str, target: int = 700) -> str:
    parts = re.split(r"(?<=[.?!]) ", text)
    paras, cur = [], ""
    for s in parts:
        cur = f"{cur} {s}".strip()
        if len(cur) >= target:
            paras.append(cur)
            cur = ""
    if cur:
        paras.append(cur)
    return "\n\n".join(paras)


def hms(seconds: float) -> str:
    s = int(round(seconds))
    return f"{s // 3600}:{s % 3600 // 60:02d}:{s % 60:02d}"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("video", help="YouTube URL or 11-char video id")
    ap.add_argument("--lang", action="append", help="preferred language code, repeatable, in order")
    ap.add_argument("--out", type=Path, help="output path (default transcripts/<id>.<lang>.md)")
    args = ap.parse_args()

    vid = video_id(args.video)

    from youtube_transcript_api import YouTubeTranscriptApi

    tracks = YouTubeTranscriptApi().list(vid)
    if args.lang:
        track = tracks.find_transcript(args.lang)
    else:
        track = next((t for t in tracks if not t.is_generated), None) or next(iter(tracks))

    fetched = track.fetch()
    snippets = list(fetched)
    text = " ".join(sn.text.replace("\n", " ").strip() for sn in snippets)
    text = re.sub(r" {2,}", " ", text).strip()
    duration = hms(snippets[-1].start + snippets[-1].duration) if snippets else "?"

    title, channel = metadata(vid)
    kind = "автоматические субтитры YouTube (ASR)" if track.is_generated else "субтитры автора"
    out = args.out or Path("transcripts") / f"{vid}.{track.language_code}.md"
    out.parent.mkdir(parents=True, exist_ok=True)

    header = "\n".join(
        [
            f"# {title or vid}",
            "",
            f"- Видео: https://youtu.be/{vid}",
            f"- Канал: {channel or '?'}",
            f"- Длительность: {duration}",
            f"- Язык: {track.language} ({track.language_code}); текст — {kind}, без правок",
            f"- Получено: {datetime.date.today().isoformat()}, scripts/fetch_transcript.py;"
            " переносы строк заменены пробелами, разбивка на абзацы добавлена для читаемости",
            "",
            "---",
            "",
            "",
        ]
    )
    out.write_text(header + paragraphize(text) + "\n", encoding="utf-8")
    print(f"{out}  ({len(text)} chars, {len(snippets)} caption segments, {track.language_code})")


if __name__ == "__main__":
    main()
