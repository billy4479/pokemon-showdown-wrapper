import pkm from 'pokemon-showdown'
import { hardcodedOpponents } from './opponent-pool.js'
import * as readline from 'node:readline'

const { Dex, toID } = pkm

const dex = Dex.mod('gen9').includeData()

const BATTLE_RULES = [
    'Terastal Clause',
    'Freeze Clause Mod',
    'Endless Battle Clause',
    'Exact HP Mod',
    '- All Abilities',
    '+ No Ability',
]

const battleFormatName = dex.formats.validate(
    'gen9customgame@@@' + BATTLE_RULES.join(',')
)

let battle: any = null
let pendingChoices: [number[] | null, number[] | null] = [null, null]

function send(msg: any) {
    process.stdout.write(JSON.stringify(msg) + '\n')
}

class Rng {
    private s: number

    constructor(seed?: number) {
        if (seed === undefined) {
            seed = Math.floor(Math.random() * 2147483647)
        }
        this.s = seed | 0
    }

    random(): number {
        this.s = (this.s + 0x6d2b79f5) | 0
        let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }

    shuffle<T>(arr: T[]): T[] {
        const result = [...arr]
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(this.random() * (i + 1))
            const tmp = result[j]!
            result[j] = result[i]!
            result[i] = tmp
        }
        return result
    }
}

function computeBaseStats(desired: {
    hp: number
    atk: number
    def: number
    spa: number
    spd: number
    spe: number
}) {
    const toBase = (final: number, offset: number) => {
        const base = Math.round((final - offset) / 2)
        return Math.max(1, Math.min(255, base))
    }
    return {
        hp: toBase(desired.hp, 141),
        atk: toBase(desired.atk, 36),
        def: toBase(desired.def, 36),
        spa: toBase(desired.spa, 36),
        spd: toBase(desired.spd, 36),
        spe: toBase(desired.spe, 36),
    }
}

function getActivePokemon(sideIndex: number) {
    const side = battle.sides[sideIndex]
    return side?.active[0] || null
}

function getSideState(sideIndex: number) {
    const side = battle.sides[sideIndex]
    const pokemon = side?.active[0] || null
    if (!pokemon || pokemon.fainted) return null

    const boosts = { ...pokemon.boosts }

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
            status: pokemon.status || '',
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
        },
        side_conditions: Object.fromEntries(
            Object.entries(side.sideConditions).map(([key, state]: [string, any]) => [
                key,
                state.layers ?? state.duration ?? 1,
            ])
        ),
        pokemon_left: side.pokemonLeft,
        weather: battle.field.weather,
        terrain: battle.field.terrain,
        turn: battle.turn,
    }

    if (pokemon.terastallized) {
        result.pokemon.terastallized = pokemon.terastallized
    }

    return result
}

function getBattleStartInfo() {
    const p0 = battle.sides[0].active[0]
    const p1 = battle.sides[1].active[0]
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
        status: p.status || '',
        ...(p.terastallized ? { terastallized: p.terastallized } : {}),
    })
    return {
        player_0: makeInfo(p0),
        opponent: makeInfo(p1),
    }
}

function sendStateFor(sideIndex: number) {
    const state = getSideState(sideIndex)
    if (state) {
        send({ type: 'state', request: { player: sideIndex, ...state } })
    }
}

function sendEnd() {
    const p0 = getActivePokemon(0)
    const p1 = getActivePokemon(1)
    const winner =
        battle.winner === battle.sides[0].name ? 'player_0' : 'player_1'
    send({
        type: 'end',
        winner,
        player_hp: p0 ? p0.hp : 0,
        opponent_hp: p1 ? p1.hp : 0,
        turns: battle.turn,
    })
}

function processTurn() {
    if (pendingChoices[0] === null || pendingChoices[1] === null) return

    const aiSlots = pendingChoices[0]!
    const opponentSlots = pendingChoices[1]!
    pendingChoices = [null, null]

    const aiMove = aiSlots.length > 0 ? `move ${aiSlots[0]! + 1}` : ''
    const opponentMove =
        opponentSlots.length > 0 ? `move ${opponentSlots[0]! + 1}` : ''

    if (!aiMove && !opponentMove) return

    try {
        battle.makeChoices(aiMove, opponentMove)
    } catch {
        sendStateFor(0)
        sendStateFor(1)
        return
    }

    if (battle.ended) {
        sendEnd()
        return
    }

    sendStateFor(0)
    sendStateFor(1)
}

function pickRandomFromPool(rng: Rng) {
    const idx = Math.floor(rng.random() * hardcodedOpponents.length)
    return { ...hardcodedOpponents[idx] }
}

function pickOpponentFromPool(speciesName: string | null, rng: Rng) {
    if (speciesName) {
        const found = hardcodedOpponents.find(
            (o) => toID(o.species) === toID(speciesName)
        )
        if (found) return { ...found }
    }
    return pickRandomFromPool(rng)
}

function generateRandomOpponent(rng: Rng): any {
    const allSpecies = dex.species
        .all()
        .filter((s: any) => s.exists && !s.isNonstandard && s.learnset)

    const shuffled = rng.shuffle(allSpecies)

    for (const species of shuffled) {
        const learnableMoves = Object.keys((species as any).learnset)
        const validMoves = learnableMoves.filter(
            (m: string) =>
                dex.moves.get(m).exists && !dex.moves.get(m).isNonstandard
        )
        if (validMoves.length < 4) continue

        const shuffledMoves = rng.shuffle(validMoves)
        const chosenMoves: string[] = []
        for (let i = 0; i < 4 && i < shuffledMoves.length; i++) {
            chosenMoves.push(shuffledMoves[i]!)
        }

        return {
            name: species.name,
            species: species.name,
            item: '',
            ability: '',
            moves: chosenMoves,
            nature: 'Hardy',
            gender: species.gender || 'M',
            evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
            ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
            level: 100,
        }
    }

    return pickRandomFromPool(rng)
}

function handleInit(msg: any) {
    const ai = msg.ai
    const opponentCfg = msg.opponent

    const aiSpeciesId = 'aipokemon'
    const aiDisplayName = ai.species || 'AI'
    const computedBaseStats = computeBaseStats(ai.stats)

    dex.data.Pokedex[aiSpeciesId] = {
        name: aiDisplayName,
        types: ai.types,
        baseStats: computedBaseStats,
        abilities: { 0: '' },
        weightkg: 0,
        num: 0,
        color: '',
        eggGroups: [] as string[],
        evos: [] as string[],
    }
    dex.data.FormatsData[aiSpeciesId] = {}
    if (dex.species.speciesCache.has(aiSpeciesId)) {
        dex.species.speciesCache.delete(aiSpeciesId)
    }

    const rng = new Rng(msg.seed ?? undefined)

    let opponentSet: any
    if (opponentCfg.type === 'hardcoded') {
        opponentSet = pickOpponentFromPool(opponentCfg.species || null, rng)
    } else {
        opponentSet = generateRandomOpponent(rng)
    }

    const aiSet = {
        name: aiDisplayName,
        species: aiSpeciesId,
        item: '',
        ability: '',
        moves: ai.moves,
        nature: 'Hardy',
        gender: 'N',
        evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
        ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
        level: 100,
    }

    const Battle = (pkm as any).Battle
    battle = new Battle({
        formatid: battleFormatName,
        send: () => {},
        p1: { name: 'Player 1', team: [aiSet] },
        p2: { name: 'Player 2', team: [opponentSet] },
    })

    if (battle.requestState === 'teampreview') {
        battle.makeChoices('team 1', 'team 1')
    }

    pendingChoices = [null, null]

    send({ type: 'battle_start', ...getBattleStartInfo() })
    sendStateFor(0)
    sendStateFor(1)
}

function handleChoice(msg: any) {
    if (!battle || battle.ended) return

    const player = Number(msg.player)
    if (player !== 0 && player !== 1) return

    pendingChoices[player] = msg.slots || []

    processTurn()
}

function main() {
    send({ type: 'ready' })

    const rl = readline.createInterface({ input: process.stdin })
    rl.on('line', (line: string) => {
        try {
            const msg = JSON.parse(line)
            if (msg.type === 'init') {
                handleInit(msg)
            } else if (msg.type === 'choice') {
                handleChoice(msg)
            }
        } catch (e: any) {
            send({ type: 'error', message: e.message })
        }
    })
}

main()
