import pkm from "pokemon-showdown";
import * as readline from "node:readline";
import { customRules } from "./custom-rules.js";

const { Dex, toID } = pkm;

const dex = Dex.mod("gen9").includeData();

const battleFormatName = dex.formats.validate(
    "gen9customgame@@@" + customRules(true),
);
const battleFormat = dex.formats.get(battleFormatName, true);
const ruleTable = dex.formats.getRuleTable(battleFormat);

let battle: any = null;
let pendingChoices: [number[] | null, number[] | null] = [null, null];

function send(msg: any) {
    process.stdout.write(JSON.stringify(msg) + "\n");
}

class Rng {
    private s: number;

    constructor(seed?: number) {
        if (seed === undefined) {
            seed = Math.floor(Math.random() * 2147483647);
        }
        this.s = seed | 0;
    }

    random(): number {
        this.s = (this.s + 0x6d2b79f5) | 0;
        let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    shuffle<T>(arr: T[]): T[] {
        const result = [...arr];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(this.random() * (i + 1));
            const tmp = result[j]!;
            result[j] = result[i]!;
            result[i] = tmp;
        }
        return result;
    }
}

function computeBaseStats(desired: {
    hp: number;
    atk: number;
    def: number;
    spa: number;
    spd: number;
    spe: number;
}) {
    const toBase = (final: number, offset: number) => {
        const base = Math.round((final - offset) / 2);
        return Math.max(1, Math.min(255, base));
    };
    return {
        hp: toBase(desired.hp, 141),
        atk: toBase(desired.atk, 36),
        def: toBase(desired.def, 36),
        spa: toBase(desired.spa, 36),
        spd: toBase(desired.spd, 36),
        spe: toBase(desired.spe, 36),
    };
}

function getActivePokemon(sideIndex: number) {
    const side = battle.sides[sideIndex];
    return side?.active[0] || null;
}

function getSideState(sideIndex: number) {
    const side = battle.sides[sideIndex];
    const pokemon = side?.active[0] || null;
    if (!pokemon || pokemon.fainted) return null;

    const boosts = { ...pokemon.boosts };

    const result: any = {
        slots: pokemon.moveSlots.map((slot: any) => ({
            id: slot.id,
            pp: slot.pp,
            maxpp: slot.maxpp,
            disabled: !!slot.disabled,
        })),
        pokemon: {
            species: pokemon.species.name,
            types: pokemon.types,
            hp: pokemon.hp,
            maxhp: pokemon.maxhp,
            status: pokemon.status || "",
            item: pokemon.item,
            boosts: {
                atk: boosts.atk || 0,
                def: boosts.def || 0,
                spa: boosts.spa || 0,
                spd: boosts.spd || 0,
                spe: boosts.spe || 0,
                accuracy: boosts.accuracy || 0,
                evasion: boosts.evasion || 0,
            },
            fainted: !!pokemon.fainted,
            speed: pokemon.speed,
            level: pokemon.level,
            stats: {
                hp: pokemon.maxhp,
                atk: pokemon.baseStoredStats.atk,
                def: pokemon.baseStoredStats.def,
                spa: pokemon.baseStoredStats.spa,
                spd: pokemon.baseStoredStats.spd,
                spe: pokemon.baseStoredStats.spe,
            },
            volatiles: Object.fromEntries(
                Object.entries(pokemon.volatiles || {}).map(
                    ([key, state]: [string, any]) => [
                        key,
                        state.layers ?? state.duration ?? 1,
                    ],
                ),
            ),
        },
        side_conditions: Object.fromEntries(
            Object.entries(side.sideConditions).map(
                ([key, state]: [string, any]) => [
                    key,
                    state.layers ?? state.duration ?? 1,
                ],
            ),
        ),
        pokemon_left: side.pokemonLeft,
        weather: battle.field.weather,
        terrain: battle.field.terrain,
        turn: battle.turn,
    };

    if (pokemon.terastallized) {
        result.pokemon.terastallized = pokemon.terastallized;
    }

    return result;
}

function getBattleStartInfo() {
    const p0 = battle.sides[0].active[0];
    const p1 = battle.sides[1].active[0];
    const makeInfo = (p: any) => ({
        species: p.name,
        types: p.types,
        stats: {
            hp: p.maxhp,
            atk: p.baseStoredStats.atk,
            def: p.baseStoredStats.def,
            spa: p.baseStoredStats.spa,
            spd: p.baseStoredStats.spd,
            spe: p.baseStoredStats.spe,
        },
        item: p.item,
        hp: p.hp,
        maxhp: p.maxhp,
        level: p.level,
        status: p.status || "",
        ...(p.terastallized ? { terastallized: p.terastallized } : {}),
    });
    return {
        player_0: makeInfo(p0),
        opponent: makeInfo(p1),
    };
}

function sendStateFor(sideIndex: number) {
    const state = getSideState(sideIndex);
    if (state) {
        send({ type: "state", request: { player: sideIndex, ...state } });
    }
}

function sendEnd(winnerOverride?: number) {
    const p0 = getActivePokemon(0);
    const p1 = getActivePokemon(1);
    const winner =
        winnerOverride ??
        (battle.winner === battle.sides[0].name ? 0 : 1);
    send({
        type: "end",
        winner,
        player_hp: p0 ? p0.hp : 0,
        opponent_hp: p1 ? p1.hp : 0,
        turns: battle.turn,
    });
}

function validateChoice(sideIndex: number, slots: number[]): boolean {
    if (slots.length === 0) return true;
    const pokemon = battle.sides[sideIndex].active[0];
    if (!pokemon || pokemon.fainted) return false;
    for (const slot of slots) {
        if (slot < 0 || slot >= pokemon.moveSlots.length) return false;
        const moveSlot = pokemon.moveSlots[slot];
        if (moveSlot.disabled) return false;
        if (moveSlot.pp <= 0) return false;
    }
    return true;
}

function processTurn() {
    if (pendingChoices[0] === null || pendingChoices[1] === null) return;

    const aiSlots = pendingChoices[0]!;
    const opponentSlots = pendingChoices[1]!;
    pendingChoices = [null, null];

    const aiMove = aiSlots.length > 0 ? `move ${aiSlots[0]! + 1}` : "";
    const opponentMove =
        opponentSlots.length > 0 ? `move ${opponentSlots[0]! + 1}` : "";

    if (!aiMove && !opponentMove) return;

    if (!validateChoice(0, aiSlots)) {
        sendEnd(1);
        return;
    }
    if (!validateChoice(1, opponentSlots)) {
        sendEnd(0);
        return;
    }

    try {
        battle.makeChoices(aiMove, opponentMove);
    } catch {
        if (!validateChoice(0, aiSlots)) {
            sendEnd(1);
        } else if (!validateChoice(1, opponentSlots)) {
            sendEnd(0);
        } else {
            sendEnd(1);
        }
        return;
    }

    if (battle.ended) {
        sendEnd();
        return;
    }

    sendStateFor(0);
    sendStateFor(1);
}

function generateRandomOpponent(rng: Rng): any | null {
    const allSpecies = dex.species
        .all()
        .filter((s: any) => s.exists && !s.isNonstandard);

    const shuffled = rng.shuffle(allSpecies);

    for (const species of shuffled) {
        const learnsetData = dex.data.Learnsets?.[species.id]?.learnset;
        if (!learnsetData) continue;
        const learnableMoves = Object.keys(learnsetData);
        const validMoves = learnableMoves.filter((m: string) => {
            const move = dex.moves.get(m);
            if (!move.exists || move.isNonstandard) return false;
            if (ruleTable.check("move:" + move.id)) return false;
            return true;
        });
        if (validMoves.length < 4) continue;

        const shuffledMoves = rng.shuffle(validMoves);
        const chosenMoves: string[] = [];
        for (let i = 0; i < 4 && i < shuffledMoves.length; i++) {
            chosenMoves.push(shuffledMoves[i]!);
        }

        return {
            name: species.name,
            species: species.name,
            item: "",
            ability: "",
            moves: chosenMoves,
            nature: "Hardy",
            gender: species.gender || "M",
            evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
            ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
            level: 100,
        };
    }

    send({ type: "error", message: "No valid random opponent could be generated" });
    return null;
}

function buildSpecifiedOpponent(cfg: any): any | null {
    const speciesId = toID(cfg.species);
    if (!speciesId) {
        send({ type: "error", message: "No species specified" });
        return null;
    }

    const species = dex.species.get(speciesId);
    if (!species.exists) {
        send({ type: "error", message: `Species '${cfg.species}' not found` });
        return null;
    }

    if (!cfg.moves || !Array.isArray(cfg.moves) || cfg.moves.length === 0) {
        send({ type: "error", message: "At least one move must be specified" });
        return null;
    }

    const moveIds = cfg.moves.map((m: string) => toID(m));

    if (new Set(moveIds).size !== moveIds.length) {
        send({ type: "error", message: "Duplicate moves are not allowed" });
        return null;
    }

    const learnsetData: Record<string, any> | undefined = dex.data.Learnsets?.[species.id]?.learnset;
    if (!learnsetData) {
        send({ type: "error", message: `No learnset data for '${species.name}'` });
        return null;
    }

    for (const moveId of moveIds) {
        const move = dex.moves.get(moveId);
        if (!move.exists) {
            send({ type: "error", message: `Move '${moveId}' not found` });
            return null;
        }
        if (move.isNonstandard) {
            send({ type: "error", message: `Move '${moveId}' is non-standard` });
            return null;
        }
        if (ruleTable.check("move:" + move.id)) {
            send({ type: "error", message: `Move '${moveId}' is banned in this format` });
            return null;
        }
        if (!learnsetData[moveId]) {
            send({ type: "error", message: `'${species.name}' cannot learn '${moveId}'` });
            return null;
        }
    }

    return {
        name: species.name,
        species: species.name,
        item: "",
        ability: "",
        moves: moveIds,
        nature: "Hardy",
        gender: (species as any).gender || "M",
        evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
        level: 100,
    };
}

function handleInit(msg: any) {
    const ai = msg.ai;
    const opponentCfg = msg.opponent;

    const aiSpeciesId = "aipokemon";
    const aiDisplayName = ai.species || "AI";
    const computedBaseStats = computeBaseStats(ai.stats);

    dex.data.Pokedex[aiSpeciesId] = {
        name: aiDisplayName,
        types: ai.types,
        baseStats: computedBaseStats,
        abilities: { 0: "" },
        weightkg: 0,
        num: 0,
        color: "",
        eggGroups: [] as string[],
        evos: [] as string[],
    };
    dex.data.FormatsData[aiSpeciesId] = {};
    if (dex.species.speciesCache.has(aiSpeciesId)) {
        dex.species.speciesCache.delete(aiSpeciesId);
    }

    const rng = new Rng(msg.seed ?? undefined);

    let opponentSet: any;
    if (opponentCfg.type === "specified") {
        opponentSet = buildSpecifiedOpponent(opponentCfg);
        if (!opponentSet) return;
    } else {
        opponentSet = generateRandomOpponent(rng);
        if (!opponentSet) return;
    }

    const aiSet = {
        name: aiDisplayName,
        species: aiSpeciesId,
        item: "",
        ability: "",
        moves: ai.moves,
        nature: "Hardy",
        gender: "N",
        evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
        level: 100,
    };

    const Battle = (pkm as any).Battle;
    battle = new Battle({
        formatid: battleFormatName,
        send: () => {},
        p1: { name: "Player 1", team: [aiSet] },
        p2: { name: "Player 2", team: [opponentSet] },
    });

    if (battle.requestState === "teampreview") {
        battle.makeChoices("team 1", "team 1");
    }

    pendingChoices = [null, null];

    send({ type: "battle_start", ...getBattleStartInfo() });
    sendStateFor(0);
    sendStateFor(1);
}

function handleChoice(msg: any) {
    if (!battle || battle.ended) return;

    const player = Number(msg.player);
    if (player !== 0 && player !== 1) return;

    pendingChoices[player] = msg.slots || [];

    processTurn();
}

function main() {
    send({ type: "ready" });

    const rl = readline.createInterface({ input: process.stdin });
    rl.on("line", (line: string) => {
        try {
            const msg = JSON.parse(line);
            if (msg.type === "init") {
                handleInit(msg);
            } else if (msg.type === "choice") {
                handleChoice(msg);
            }
        } catch (e: any) {
            send({ type: "error", message: e.message });
        }
    });
}

main();
