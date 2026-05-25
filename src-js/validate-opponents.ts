import pkm from "pokemon-showdown";
import { customRules } from "./custom-rules.js";
import { readFileSync } from "node:fs";

const { Dex, toID } = pkm;

const dex = Dex.mod("gen9").includeData();

const formatName = dex.formats.validate(
    "gen9customgame@@@" + customRules(true),
);
const format = dex.formats.get(formatName, true);
const ruleTable = dex.formats.getRuleTable(format);

const data = JSON.parse(readFileSync(process.argv[2], "utf-8"));

const results = [];
for (const entry of data) {
    const speciesId = toID(entry.species);
    const species = dex.species.get(speciesId);

    const errors: string[] = [];

    if (!species.exists) {
        errors.push(`Species '${entry.species}' not found`);
    }

    if (!entry.moves || !Array.isArray(entry.moves) || entry.moves.length === 0) {
        errors.push("No moves specified");
    }

    const moveIds = (entry.moves ?? []).map((m: string) => toID(m));

    if (new Set(moveIds).size !== moveIds.length) {
        errors.push("Duplicate moves are not allowed");
    }

    const learnsetData: Record<string, any> | undefined =
        species.exists ? dex.data.Learnsets?.[species.id]?.learnset : undefined;

    for (let i = 0; i < moveIds.length; i++) {
        const moveId = moveIds[i];
        const moveName = entry.moves[i];
        const move = dex.moves.get(moveId);

        if (!move.exists) {
            errors.push(`Move '${moveName}' not found`);
            continue;
        }

        if (move.isNonstandard) {
            errors.push(`Move '${moveName}' is non-standard`);
            continue;
        }

        if (ruleTable.check("move:" + move.id)) {
            errors.push(`Move '${moveName}' is banned in this format`);
            continue;
        }

        if (!learnsetData || !learnsetData[moveId]) {
            errors.push(`'${species.name}' cannot learn '${moveName}'`);
            continue;
        }
    }

    results.push({
        species: entry.species,
        valid: errors.length === 0,
        errors,
    });
}

console.log(JSON.stringify(results, null, 2));
