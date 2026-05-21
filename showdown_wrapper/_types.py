from collections.abc import Callable
from dataclasses import dataclass, field
from typing import NotRequired, TypedDict


Stats = TypedDict("Stats", {"hp": int, "atk": int, "def": int, "spa": int, "spd": int, "spe": int})


class MoveSlot(TypedDict):
    id: str
    pp: int
    maxpp: int
    disabled: bool


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


@dataclass(frozen=True)
class BattleStart:
    player_0: PokemonInfo
    opponent: PokemonInfo


@dataclass(frozen=True)
class PlayerState:
    player: int
    slots: list[MoveSlot]


@dataclass(frozen=True)
class BattleResult:
    winner: str
    player_hp: int
    opponent_hp: int
    turns: int


MoveSelector = Callable[[PlayerState, PlayerState], tuple[list[int], list[int]]]


@dataclass(frozen=True)
class BattleConfig:
    ai: AIConfig
    opponent: OpponentConfig
    move_selector: MoveSelector = field(kw_only=True)
