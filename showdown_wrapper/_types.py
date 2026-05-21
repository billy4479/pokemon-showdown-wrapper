from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, NotRequired, TypedDict


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
    ability: str
    item: str
    boosts: Boosts
    fainted: bool
    speed: int
    level: int
    terastallized: NotRequired[str]


class AIConfig(TypedDict):
    species: str
    types: list[str]
    stats: Stats
    ability: str
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
    ability: str
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
