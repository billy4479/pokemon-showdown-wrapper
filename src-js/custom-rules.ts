export const customRules = (needsOverrideMaxTeamSize: boolean = false) => {
    let rules = [
        "Picked Team Size = 1",
        `${needsOverrideMaxTeamSize ? "!!" : ""} Max Team Size = 1`,
        "Min Team Size = 1",

        "Terastal Clause",
        "Dynamax Clause",
        "Z-Move Clause",
        "CFZ Clause",

        "-Dragon Ascent",
        "-pokemontag:allitems",

        "OHKO Clause",
        "Evasion Clause",
        // "Accuracy Moves Clause",
        "Sleep Moves Clause",
        "Freeze Clause Mod",
        "Moody Clause",
        "Swagger Clause",

        "Endless Battle Clause",
        "Exact HP Mod",

        "-All Abilities",
        "+No Ability",
    ];

    if (needsOverrideMaxTeamSize)
        rules = rules.concat(["Obtainable", "Min Source Gen = 9"]);

    return rules.join(",");
};
