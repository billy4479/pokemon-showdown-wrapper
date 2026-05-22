import pkm from "pokemon-showdown";
import { customRules } from "./custom-rules.js";

const { Dex } = pkm;

const dex = Dex.mod("gen9").includeData();

const formatName = dex.formats.validate(
    "gen9anythinggoes@@@" + customRules(false),
);

const ruleTable = dex.formats.getRuleTable(dex.formats.get(formatName, true));

const allMoves = dex.moves.all();
const allowed = allMoves.filter((move) => {
    if (move.id === "???") return false;

    if (ruleTable.check("move:" + move.id)) return false;

    if (ruleTable.check("pokemontag:allmoves")) return false;

    if (move.isNonstandard) return false;

    if (move.ohko) return false;

    if (move.status === "slp") return false;

    return true;
});

console.log(JSON.stringify(allowed.map((m) => m.id)));
