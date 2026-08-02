"""pokedex — a Pokémon entry (real stats, sprite, dex text) from PokéAPI.

Runs on the Tesserae side, never the client. Returns a JSON-serialisable
dict, or {"error": "friendly message"}; never raises — helpers hand back
``(value, error)`` tuples so the failure path stays a plain return.

Mode "random" rolls a new Pokémon on every fetch (i.e. every render), so a
scheduled page push shows a different one each refresh. "daily" is stable
per calendar day; "pick" locks to a named Pokémon. The pool option bounds
the roll to a generation span (default: the original Kanto 151).

Per-Pokémon payloads are static, so they cache basically forever in
ctx["data_dir"] — repeat rolls stop hitting PokéAPI once the pool is warm.
Sprites stay as hotlinked GitHub URLs; the client/canvas <img>'s them.
"""

from __future__ import annotations

import contextlib
import json
import random
import re
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

API = "https://pokeapi.co/api/v2"
USER_AGENT = "tesserae/0.1 (+pokedex widget)"
HTTP_TIMEOUT_S = 10
CACHE_TTL_S = 30 * 86400  # dex data is effectively static

POOLS = {
    "gen1": (1, 151),
    "gen2": (1, 251),
    "gen3": (1, 386),
    "all": (1, 1025),
}

STAT_KEYS = {
    "hp": "hp",
    "attack": "atk",
    "defense": "def",
    "special-attack": "spa",
    "special-defense": "spd",
    "speed": "spe",
}

ROMAN = {
    "generation-i": "I", "generation-ii": "II", "generation-iii": "III",
    "generation-iv": "IV", "generation-v": "V", "generation-vi": "VI",
    "generation-vii": "VII", "generation-viii": "VIII", "generation-ix": "IX",
}


def _get_json(url: str, *, retry: bool = True) -> tuple[dict[str, Any] | None, str | None]:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_S) as resp:
            return json.loads(resp.read().decode("utf-8")), None
    except urllib.error.HTTPError as err:
        if err.code == 404:
            return None, "Pokémon not found — check the name or dex number."
        return None, "PokéAPI is having trouble right now."
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
        if retry:
            time.sleep(1.0)
            return _get_json(url, retry=False)
        return None, "Couldn't reach PokéAPI right now."


def _english(entries: list[dict[str, Any]], field: str) -> str:
    for e in entries:
        if ((e.get("language") or {}).get("name")) == "en":
            return (e.get(field) or "").strip()
    return ""


def _flavor(species: dict[str, Any]) -> str:
    # Prefer a classic-feeling entry: first English one in the list.
    text = _english(species.get("flavor_text_entries") or [], "flavor_text")
    return re.sub(r"[\n\f\r]+", " ", text).replace("­ ", "")


def _build(ident: str) -> tuple[dict[str, Any] | None, str | None]:
    poke, err = _get_json(f"{API}/pokemon/{ident}")
    if err or poke is None:
        return None, err or "Couldn't load the Pokémon."
    species_url = ((poke.get("species") or {}).get("url")) or f"{API}/pokemon-species/{ident}"
    species, err = _get_json(species_url)
    if err or species is None:
        species = {}

    stats: dict[str, int] = {}
    for s in poke.get("stats") or []:
        key = STAT_KEYS.get(((s.get("stat") or {}).get("name")) or "")
        if key:
            stats[key] = int(s.get("base_stat") or 0)
    sprites = poke.get("sprites") or {}
    art = ((sprites.get("other") or {}).get("official-artwork") or {}).get("front_default")
    gen_slug = ((species.get("generation") or {}).get("name")) or ""

    return {
        "id": int(poke.get("id") or 0),
        "name": str(poke.get("name") or "").replace("-", " ").title(),
        "genus": _english(species.get("genera") or [], "genus"),
        "flavor": _flavor(species),
        "types": [
            ((t.get("type") or {}).get("name") or "").upper()
            for t in sorted(poke.get("types") or [], key=lambda t: t.get("slot") or 0)
        ],
        "abilities": [
            ((a.get("ability") or {}).get("name") or "").replace("-", " ").title()
            for a in poke.get("abilities") or []
            if not a.get("is_hidden")
        ],
        "stats": stats,
        "stat_total": sum(stats.values()),
        "height_m": round((poke.get("height") or 0) / 10, 1),
        "weight_kg": round((poke.get("weight") or 0) / 10, 1),
        "base_exp": poke.get("base_experience"),
        "capture_rate": species.get("capture_rate"),
        "is_legendary": bool(species.get("is_legendary")),
        "is_mythical": bool(species.get("is_mythical")),
        "generation": ROMAN.get(gen_slug, gen_slug.replace("generation-", "").upper()),
        "sprite_pixel": sprites.get("front_default"),
        "sprite_art": art,
    }, None


def _cached_entry(ident: str, ctx: dict[str, Any]) -> tuple[dict[str, Any] | None, str | None]:
    cache_path: Path | None = None
    if ctx.get("data_dir"):
        cache_dir = Path(ctx["data_dir"])
        with contextlib.suppress(OSError):
            cache_dir.mkdir(parents=True, exist_ok=True)
        safe = re.sub(r"[^a-z0-9-]", "", str(ident).lower()) or "x"
        cache_path = cache_dir / f"poke_{safe}.json"
        if cache_path.exists() and time.time() - cache_path.stat().st_mtime < CACHE_TTL_S:
            with contextlib.suppress(OSError, json.JSONDecodeError):
                return json.loads(cache_path.read_text(encoding="utf-8")), None

    entry, err = _build(ident)
    if err or entry is None:
        return None, err or "Couldn't load the Pokémon."
    if cache_path is not None:
        with contextlib.suppress(OSError):
            cache_path.write_text(json.dumps(entry), encoding="utf-8")
    return entry, None


def fetch(
    options: dict[str, Any], settings: dict[str, Any], *, ctx: dict[str, Any]
) -> dict[str, Any]:
    mode = str(options.get("mode") or "random").strip()
    pool = str(options.get("pool") or "gen1").strip()
    pick = str(options.get("pokemon") or "").strip().lower()
    lo, hi = POOLS.get(pool, POOLS["gen1"])

    if mode == "pick" and pick:
        ident = pick
    elif mode == "daily":
        ident = str(lo + int(time.time() // 86400) % (hi - lo + 1))
    else:
        ident = str(random.randint(lo, hi))

    entry, err = _cached_entry(ident, ctx)
    if err or entry is None:
        return {"error": err or "Couldn't load the Pokémon."}
    result = dict(entry)
    result["mode"] = mode
    result["fetched_at"] = int(time.time())
    return result
