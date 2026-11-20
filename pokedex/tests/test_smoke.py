"""Smoke tests for pokedex: shaping + option handling, no network."""

from __future__ import annotations

import server

POKE = {
    "id": 25,
    "name": "pikachu",
    "height": 4,
    "weight": 60,
    "base_experience": 112,
    "species": {"url": "https://pokeapi.co/api/v2/pokemon-species/25/"},
    "types": [{"slot": 1, "type": {"name": "electric"}}],
    "abilities": [
        {"ability": {"name": "static"}, "is_hidden": False},
        {"ability": {"name": "lightning-rod"}, "is_hidden": True},
    ],
    "stats": [
        {"base_stat": 35, "stat": {"name": "hp"}},
        {"base_stat": 55, "stat": {"name": "attack"}},
        {"base_stat": 40, "stat": {"name": "defense"}},
        {"base_stat": 50, "stat": {"name": "special-attack"}},
        {"base_stat": 50, "stat": {"name": "special-defense"}},
        {"base_stat": 90, "stat": {"name": "speed"}},
    ],
    "sprites": {
        "front_default": "https://raw.githubusercontent.com/x/25.png",
        "other": {"official-artwork": {"front_default": "https://raw.githubusercontent.com/x/art25.png"}},
    },
}

SPECIES = {
    "genera": [{"genus": "Mouse Pokémon", "language": {"name": "en"}}],
    "flavor_text_entries": [
        {"flavor_text": "When several of\nthese POKéMON\fgather...", "language": {"name": "en"}}
    ],
    "generation": {"name": "generation-i"},
    "capture_rate": 190,
    "is_legendary": False,
    "is_mythical": False,
}


def _fake_get_json(url, **kwargs):
    if "species" in url:
        return SPECIES, None
    return POKE, None


def test_build_shapes_entry(monkeypatch):
    monkeypatch.setattr(server, "_get_json", _fake_get_json)
    entry, err = server._build("25")
    assert err is None
    assert entry["name"] == "Pikachu"
    assert entry["types"] == ["ELECTRIC"]
    assert entry["stats"] == {"hp": 35, "atk": 55, "def": 40, "spa": 50, "spd": 50, "spe": 90}
    assert entry["stat_total"] == 320
    assert entry["height_m"] == 0.4
    assert entry["weight_kg"] == 6.0
    assert entry["genus"] == "Mouse Pokémon"
    assert "\n" not in entry["flavor"] and "gather" in entry["flavor"]
    assert entry["generation"] == "I"
    assert entry["abilities"] == ["Static"]


def test_fetch_random_stays_in_pool(monkeypatch):
    seen = []

    def spy_get_json(url, **kwargs):
        seen.append(url)
        return _fake_get_json(url)

    monkeypatch.setattr(server, "_get_json", spy_get_json)
    out = server.fetch({"mode": "random", "pool": "gen1"}, {}, ctx={})
    assert "error" not in out
    ident = seen[0].rstrip("/").rsplit("/", 1)[-1]
    assert 1 <= int(ident) <= 151


def test_fetch_pick_uses_name(monkeypatch):
    monkeypatch.setattr(server, "_get_json", _fake_get_json)
    out = server.fetch({"mode": "pick", "pokemon": "Pikachu"}, {}, ctx={})
    assert out["name"] == "Pikachu"
    assert out["mode"] == "pick"


def test_fetch_error_is_friendly(monkeypatch):
    monkeypatch.setattr(server, "_get_json", lambda url, **k: (None, "PokéAPI is having trouble right now."))
    out = server.fetch({"mode": "pick", "pokemon": "missingno"}, {}, ctx={})
    assert "error" in out


def test_dex_text_option_defaults_to_two_lines():
    import json
    from pathlib import Path

    manifest = json.loads((Path(server.__file__).parent / "plugin.json").read_text())
    opt = next(o for o in manifest["cell_options"] if o["name"] == "dex_text")
    assert opt["default"] == "short"
    assert [c["value"] for c in opt["choices"]] == ["short", "full", "off"]
