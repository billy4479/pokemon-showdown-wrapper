from showdown_wrapper import ShowdownPool, BattleConfig, PlayerState

seed = 42


def first_move_ai(p0: PlayerState, p1: PlayerState) -> tuple[int, int]:
    print(p0)
    print(p1)
    return (0, 0)


ai = {
    "species": "Pikachu",
    "types": ["Electric"],
    "stats": {
        "hp": 250,
        "atk": 150,
        "def": 100,
        "spa": 120,
        "spd": 100,
        "spe": 180,
    },
    "moves": ["thunderbolt", "irontail", "quickattack", "thunderwave"],
}

configs = [
    BattleConfig(
        ai=ai,
        opponent={
            "type": "specified",
            "species": "garchomp",
            "moves": ["earthquake", "dragonclaw", "stoneedge", "swordsdance"],
        },
        move_selector=first_move_ai,
        seed=seed,
    ),
    BattleConfig(
        ai=ai,
        opponent={
            "type": "specified",
            "species": "dragapult",
            "moves": ["dragondarts", "shadowball", "uturn", "willowisp"],
        },
        move_selector=first_move_ai,
        seed=seed,
    ),
    BattleConfig(
        ai=ai,
        opponent={"type": "random"},
        move_selector=first_move_ai,
        seed=seed,
    ),
    BattleConfig(
        ai=ai,
        opponent={"type": "random"},
        move_selector=first_move_ai,
        seed=seed,
    ),
]

with ShowdownPool(max_size=1, command=["node", "dist/showdown-wrapper.js"]) as pool:
    results = pool.run_battles(configs)

for i, r in enumerate(results):
    print(
        f"Battle {i}: {r.winner} won in {r.turns} turns "
        f"(p0 HP: {r.player_hp}, p1 HP: {r.opponent_hp})"
    )
