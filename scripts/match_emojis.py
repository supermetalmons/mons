#!/usr/bin/env python3.11
import os, sys, base64, glob, json, time, signal
from pathlib import Path
from datetime import datetime
from openai import OpenAI

MODEL = os.environ.get("EMOJI_MODEL", "gpt-4o-mini")

def b64_data_url(p):
    with open(p, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("ascii")
    return f"data:image/webp;base64,{b64}"

def pick_emojis(client, data_url):
    prompt = "Look at the image and output 1–3 Unicode emoji characters that best match it. Rules: return ONLY the emoji characters, separated by a single space, no text, no colons, no names, no punctuation."
    r = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": "You select emojis that match images. Output only emojis."},
            {"role": "user", "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": data_url}}
            ]}
        ],
        temperature=0.2,
    )
    out = r.choices[0].message.content.strip()
    return [t for t in out.split() if t]

def load_existing(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

def save_json(path, data):
    tmp = path.with_suffix(".tmp.json")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(path)

def main():
    if "OPENAI_API_KEY" not in os.environ:
        print("ERROR: Set OPENAI_API_KEY", file=sys.stderr)
        sys.exit(1)

    folder = Path(".").resolve()
    out_json = folder / "emoji_mapping.json"
    paths = sorted(glob.glob(str(folder / "*.webp")))
    if not paths:
        print("No .webp files found", file=sys.stderr)
        sys.exit(1)

    mapping = load_existing(out_json)
    total = len(paths)
    start_time = time.time()
    print(f"== emoji mapper ==")
    print(f"time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"dir:  {folder}")
    print(f"out:  {out_json.name}")
    print(f"model:{MODEL}")
    print(f"found {total} images")
    if mapping:
        print(f"resume with {len(mapping)} already processed")

    client = OpenAI()
    processed = 0

    interrupted = {"flag": False}
    def handle_sigint(signum, frame):
        interrupted["flag"] = True
        print("\nInterrupted. Saving progress...")

    signal.signal(signal.SIGINT, handle_sigint)

    for idx, p in enumerate(paths, 1):
        name = Path(p).stem
        if name in mapping:
            processed += 1
            print(f"[{idx}/{total}] {name} (skip)")
            continue

        print(f"[{idx}/{total}] {name} ...", end="", flush=True)
        tries = 0
        while True:
            try:
                data_url = b64_data_url(p)
                emojis = pick_emojis(client, data_url)
                mapping[name] = emojis
                processed += 1
                took = time.time() - start_time
                rate = processed / max(took, 1e-6)
                remaining = total - processed
                eta = int(remaining / max(rate, 1e-6))
                print(f" ok {' '.join(emojis) if emojis else '(none)'} | eta ~{eta}s")
                break
            except Exception as e:
                tries += 1
                if tries >= 5:
                    mapping[name] = []
                    print(f" failed after retries -> recorded []")
                    break
                backoff = min(2.0 * tries, 10.0) + 0.3
                print(f" retry {tries}: {type(e).__name__}: {e} (sleep {backoff:.1f}s)")
                time.sleep(backoff)

        if interrupted["flag"]:
            break

        if processed % 20 == 0:
            save_json(out_json, mapping)
            print(f"checkpoint saved ({processed}/{total})")

    save_json(out_json, mapping)
    duration = int(time.time() - start_time)
    print(f"done. wrote {len(mapping)} entries to {out_json.name} in {duration}s")

if __name__ == "__main__":
    main()
