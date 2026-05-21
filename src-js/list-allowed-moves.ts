import pkm from 'pokemon-showdown'

const { Dex } = pkm

const dex = Dex.mod('gen9').includeData()

const customRules = [
    'Picked Team Size = 1',
    'Max Team Size = 1',
    'Min Team Size = 1',
    'Terastal Clause',
    '-pokemontag:allitems',
    'OHKO Clause',
    'Evasion Clause',
    'Accuracy Moves Clause',
    'Sleep Moves Clause',
    'Freeze Clause Mod',
    'Moody Clause',
    'Swagger Clause',
    'Endless Battle Clause',
    'Exact HP Mod',
]

const formatName = dex.formats.validate(
    'gen9anythinggoes@@@' + customRules.join(',')
)

const ruleTable = dex.formats.getRuleTable(dex.formats.get(formatName, true))

const allMoves = dex.moves.all()
const allowed = allMoves.filter((move) => {
    if (move.id === '???') return false

    if (ruleTable.check('move:' + move.id)) return false

    if (ruleTable.check('pokemontag:allmoves')) return false

    if (move.isNonstandard) return false

    if (move.ohko) return false

    if (move.status === 'slp') return false

    return true
})

console.log(JSON.stringify(allowed.map((m) => m.id)))
