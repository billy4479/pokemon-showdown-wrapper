from collections.abc import Callable
from dataclasses import dataclass, field
from typing import NotRequired, TypedDict


Stats = TypedDict("Stats", {"hp": int, "atk": int, "def": int, "spa": int, "spd": int, "spe": int})


Boosts = TypedDict("Boosts", {"atk": int, "def": int, "spa": int, "spd": int, "spe": int, "accuracy": int, "evasion": int})


class MoveSlot(TypedDict):
    id: str
    pp: int
    maxpp: int
    disabled: bool


class ActivePokemonInfo(TypedDict):
    species: str
    types: list[str]
    hp: int
    maxhp: int
    status: str
    item: str
    boosts: Boosts
    fainted: bool
    speed: int
    level: int
    stats: Stats
    terastallized: NotRequired[str]
    volatiles: NotRequired[dict[str, int]]


class AIConfig(TypedDict):
    species: str
    types: list[str]
    stats: Stats
    moves: list[str]


class OpponentHardcoded(TypedDict):
    type: str  # "hardcoded"
    species: NotRequired[str | None]


class OpponentRandom(TypedDict):
    type: str  # "random"


OpponentConfig = OpponentHardcoded | OpponentRandom


class PokemonInfo(TypedDict):
    species: str
    types: list[str]
    stats: Stats
    item: str
    hp: int
    maxhp: int
    level: int
    status: str
    terastallized: NotRequired[str]


@dataclass(frozen=True)
class BattleStart:
    player_0: PokemonInfo
    opponent: PokemonInfo


@dataclass(frozen=True)
class PlayerState:
    player: int
    slots: list[MoveSlot]
    pokemon: ActivePokemonInfo | None = None
    side_conditions: dict[str, int] = field(default_factory=dict)
    pokemon_left: int = 0
    weather: str = ""
    terrain: str = ""
    turn: int = 0

    def to_dict(self) -> dict:
        return {
            "player": self.player,
            "slots": [dict(s) for s in self.slots],
            "pokemon": dict(self.pokemon) if self.pokemon else None,
            "side_conditions": dict(self.side_conditions),
            "pokemon_left": self.pokemon_left,
            "weather": self.weather,
            "terrain": self.terrain,
            "turn": self.turn,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "PlayerState":
        return cls(
            player=d["player"],
            slots=[MoveSlot(**s) for s in d["slots"]],
            pokemon=ActivePokemonInfo(**d["pokemon"]) if d.get("pokemon") else None,
            side_conditions=dict(d.get("side_conditions", {})),
            pokemon_left=d.get("pokemon_left", 0),
            weather=d.get("weather", ""),
            terrain=d.get("terrain", ""),
            turn=d.get("turn", 0),
        )

    def __str__(self) -> str:
        lines = []
        lines.append(f"PlayerState(player={self.player})")
        lines.append(f"  turn: {self.turn}")
        lines.append(f"  weather: {self.weather!r}")
        lines.append(f"  terrain: {self.terrain!r}")
        lines.append(f"  pokemon_left: {self.pokemon_left}")

        lines.append(f"  side_conditions: {dict(sorted(self.side_conditions.items()))}")

        lines.append(f"  slots:")
        for i, s in enumerate(self.slots):
            parts = [f"    [{i}]"]
            for k, v in s.items():
                parts.append(f"{k}={v!r}")
            lines.append(" ".join(parts))

        lines.append(f"  pokemon:")
        if self.pokemon is None:
            lines.append("    None")
        else:
            for k, v in self.pokemon.items():
                if isinstance(v, dict):
                    items = " ".join(f"{sk}={sv!r}" for sk, sv in sorted(v.items()))
                    lines.append(f"    {k}: {items}")
                else:
                    lines.append(f"    {k}: {v!r}")

        return "\n".join(lines)


@dataclass(frozen=True)
class BattleResult:
    winner: str
    player_hp: int
    opponent_hp: int
    turns: int


MoveSelector = Callable[[PlayerState, PlayerState], tuple[int, int]]


@dataclass(frozen=True)
class BattleConfig:
    ai: AIConfig
    opponent: OpponentConfig
    move_selector: MoveSelector = field(kw_only=True)
    seed: int | None = None
