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
]

const battleFormatName = dex.formats.validate(
    'gen9customgame@@@' + BATTLE_RULES.join(',')
)

let battle: any = null
let pendingChoices: [number[] | null, number[] | null] = [null, null]

function send(msg: any) {
    process.stdout.write(JSON.stringify(msg) + '\n')
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
    const pokemon = getActivePokemon(sideIndex)
    if (!pokemon || pokemon.fainted) return null
    return {
        slots: pokemon.moveSlots.map((slot: any) => ({
            id: slot.id,
            pp: slot.pp,
            maxpp: slot.maxpp,
            disabled: !!slot.disabled,
        })),
    }
}

function getBattleStartInfo() {
    const p0 = battle.sides[0].active[0]
    const p1 = battle.sides[1].active[0]
    return {
        player_0: {
            species: p0.name,
            types: p0.types,
            stats: {
                hp: p0.maxhp,
                atk: p0.baseStoredStats.atk,
                def: p0.baseStoredStats.def,
                spa: p0.baseStoredStats.spa,
                spd: p0.baseStoredStats.spd,
                spe: p0.baseStoredStats.spe,
            },
        },
        opponent: {
            species: p1.name,
            types: p1.types,
            stats: {
                hp: p1.maxhp,
                atk: p1.baseStoredStats.atk,
                def: p1.baseStoredStats.def,
                spa: p1.baseStoredStats.spa,
                spd: p1.baseStoredStats.spd,
                spe: p1.baseStoredStats.spe,
            },
        },
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

function pickRandomFromPool() {
    const idx = Math.floor(Math.random() * hardcodedOpponents.length)
    return { ...hardcodedOpponents[idx] }
}

function pickOpponentFromPool(speciesName: string | null) {
    if (speciesName) {
        const found = hardcodedOpponents.find(
            (o) => toID(o.species) === toID(speciesName)
        )
        if (found) return { ...found }
    }
    return pickRandomFromPool()
}

function generateRandomOpponent(): any {
    const allSpecies = dex.species
        .all()
        .filter((s: any) => s.exists && !s.isNonstandard && s.learnset)

    const shuffled = allSpecies.sort(() => Math.random() - 0.5)

    for (const species of shuffled) {
        const learnableMoves = Object.keys((species as any).learnset)
        const validMoves = learnableMoves.filter(
            (m: string) =>
                dex.moves.get(m).exists && !dex.moves.get(m).isNonstandard
        )
        if (validMoves.length < 4) continue

        const shuffledMoves = validMoves.sort(() => Math.random() - 0.5)
        const chosenMoves: string[] = []
        for (let i = 0; i < 4 && i < shuffledMoves.length; i++) {
            chosenMoves.push(shuffledMoves[i]!)
        }

        const abilitySlots = ['0', '1', 'H', 'S']
        let ability = ''
        for (const slot of abilitySlots) {
            if ((species.abilities as any)[slot]) {
                ability = (species.abilities as any)[slot]
                break
            }
        }

        return {
            name: species.name,
            species: species.name,
            item: '',
            ability,
            moves: chosenMoves,
            nature: 'Hardy',
            gender: species.gender || 'M',
            evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
            ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
            level: 100,
        }
    }

    return pickRandomFromPool()
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
        abilities: { 0: ai.ability },
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

    let opponentSet: any
    if (opponentCfg.type === 'hardcoded') {
        opponentSet = pickOpponentFromPool(opponentCfg.species || null)
    } else {
        opponentSet = generateRandomOpponent()
    }

    const aiSet = {
        name: aiDisplayName,
        species: aiSpeciesId,
        item: '',
        ability: ai.ability,
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
