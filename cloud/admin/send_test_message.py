#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List

import requests
from dotenv import load_dotenv


API_BASE = "https://api.telegram.org/bot{token}/{method}"


def read_env() -> Dict[str, Any]:
    load_dotenv()
    env: Dict[str, Any] = {
        "TOKEN": os.getenv("TOKEN", ""),
        "USER_ID": os.getenv("USER_ID", ""),
    }
    missing = [k for k, v in env.items() if not v]
    if missing:
        raise SystemExit(
            f"Missing env vars: {', '.join(missing)}. Configure .env or export them."
        )
    return env


def api_post(token: str, method: str, data: Dict[str, Any]) -> Dict[str, Any]:
    url = API_BASE.format(token=token, method=method)
    response = requests.post(url, data=data)
    try:
        payload = response.json()
    except Exception:
        response.raise_for_status()
        raise
    if not payload.get("ok"):
        raise RuntimeError(f"Telegram API error for {method}: {payload}")
    return payload["result"]


def load_mapping(mapping_path: Path) -> Dict[str, Any]:
    with mapping_path.open("r", encoding="utf-8") as f:
        return json.load(f)


def pick_two_custom_emoji_ids(mapping: Dict[str, Any]) -> List[str]:
    ids: List[str] = []
    for key, value in mapping.items():
        if key.startswith("__"):
            continue
        if not isinstance(value, dict):
            continue
        tel = value.get("telegram")
        if isinstance(tel, dict):
            cid = tel.get("custom_emoji_id")
            if isinstance(cid, str) and cid:
                ids.append(cid)
        if len(ids) >= 2:
            break
    if len(ids) < 2:
        raise SystemExit("Could not find two custom_emoji_id entries in emoji_mapping.json")
    return ids[:2]


def send_dm_with_custom_emojis(token: str, user_id: str, custom_emoji_ids: List[str]) -> Dict[str, Any]:
    # Telegram requires offsets/lengths in UTF-16 code units and the entity must wrap exactly one emoji
    def utf16_units_length(s: str) -> int:
        return len(s.encode("utf-16-le")) // 2

    # Use actual emoji placeholders to be replaced by custom emojis
    placeholders = ["😀", "😎"]  # each is 2 UTF-16 code units
    prefix = "Test custom emojis "
    text = f"{prefix}{placeholders[0]} {placeholders[1]}"

    prefix_units = utf16_units_length(prefix)
    first_offset = prefix_units
    first_length = utf16_units_length(placeholders[0])
    space_units = utf16_units_length(" ")
    second_offset = first_offset + first_length + space_units
    second_length = utf16_units_length(placeholders[1])

    entities = [
        {
            "type": "custom_emoji",
            "offset": first_offset,
            "length": first_length,
            "custom_emoji_id": custom_emoji_ids[0],
        },
        {
            "type": "custom_emoji",
            "offset": second_offset,
            "length": second_length,
            "custom_emoji_id": custom_emoji_ids[1],
        },
    ]

    data = {
        "chat_id": str(user_id),
        "text": text,
        "entities": json.dumps(entities, ensure_ascii=False),
    }
    return api_post(token, "sendMessage", data=data)


def main() -> None:
    env = read_env()
    token = env["TOKEN"]
    user_id = env["USER_ID"]

    workspace = Path(__file__).resolve().parents[1]
    mapping_path = workspace / "emoji_mapping.json"
    mapping = load_mapping(mapping_path)
    two_ids = pick_two_custom_emoji_ids(mapping)

    result = send_dm_with_custom_emojis(token, user_id, two_ids)
    message_id = result.get("message_id")
    print(f"Sent test message with custom emojis. Message id: {message_id}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Interrupted.")
        sys.exit(130)


