import { describe, expect, test } from "bun:test";

import { parseKeys } from "./parser";

describe("Vim input parser", () => {
    test.each([
        [
            "2j",
            ["2", "j"],
            {
                kind: "motion",
                motion: "j",
                count: 2,
                countSpecified: true,
            },
        ],
        [
            "dd",
            ["d", "d"],
            {
                kind: "operator",
                operator: "d",
                count: 1,
                register: undefined,
                target: { kind: "line" },
            },
        ],
        [
            "3dd",
            ["3", "d", "d"],
            {
                kind: "operator",
                operator: "d",
                count: 3,
                register: undefined,
                target: { kind: "line" },
            },
        ],
        [
            "d2w",
            ["d", "2", "w"],
            {
                kind: "operator",
                operator: "d",
                count: 2,
                register: undefined,
                target: { kind: "motion", motion: "w" },
            },
        ],
        [
            "2dw",
            ["2", "d", "w"],
            {
                kind: "operator",
                operator: "d",
                count: 2,
                register: undefined,
                target: { kind: "motion", motion: "w" },
            },
        ],
        [
            "2d3w",
            ["2", "d", "3", "w"],
            {
                kind: "operator",
                operator: "d",
                count: 6,
                register: undefined,
                target: { kind: "motion", motion: "w" },
            },
        ],
        [
            "diw",
            ["d", "i", "w"],
            {
                kind: "operator",
                operator: "d",
                count: 1,
                register: undefined,
                target: { kind: "text-object", textObject: "iw" },
            },
        ],
        [
            '"ayy',
            ['"', "a", "y", "y"],
            {
                kind: "operator",
                operator: "y",
                count: 1,
                register: "a",
                target: { kind: "line" },
            },
        ],
        [
            '"_dd',
            ['"', "_", "d", "d"],
            {
                kind: "operator",
                operator: "d",
                count: 1,
                register: "_",
                target: { kind: "line" },
            },
        ],
    ])("%s", (_label, keys, expected) => {
        const result = parseKeys(keys);

        expect(result.status).toBe("action");
        if (result.status === "action") {
            expect(result.action).toEqual(expected);
        }
    });

    test("0 is a motion when no count has started", () => {
        const result = parseKeys(["0"]);

        expect(result.status).toBe("action");
        if (result.status === "action") {
            expect(result.action).toEqual({
                kind: "motion",
                motion: "0",
                count: 1,
                countSpecified: false,
            });
        }
    });

    test("0 is part of a count after a non-zero digit", () => {
        const result = parseKeys(["1", "0", "j"]);

        expect(result.status).toBe("action");
        if (result.status === "action") {
            expect(result.action).toEqual({
                kind: "motion",
                motion: "j",
                count: 10,
                countSpecified: true,
            });
        }
    });

    test("gg is parsed as a multi-key motion", () => {
        const result = parseKeys(["g", "g"]);

        expect(result.status).toBe("action");
        if (result.status === "action") {
            expect(result.action).toEqual({
                kind: "motion",
                motion: "gg",
                count: 1,
                countSpecified: false,
            });
        }
    });

    test("pending state preserves the entered keys for display", () => {
        const result = parseKeys(['"', "a", "2", "d"]);

        expect(result.status).toBe("pending");
        expect(result.state.keys).toBe('"a2d');
        expect(result.state.register).toBe("a");
        expect(result.state.count).toBe("2");
        expect(result.state.operator).toBe("d");
    });

    test("f waits for and captures a target character", () => {
        const result = parseKeys(["2", "f", "x"]);

        expect(result.status).toBe("action");
        if (result.status === "action") {
            expect(result.action).toEqual({
                kind: "motion",
                motion: "f",
                count: 2,
                countSpecified: true,
                character: "x",
            });
        }
    });

    test("r waits for and captures a replacement character", () => {
        const result = parseKeys(["3", "r", "x"]);

        expect(result.status).toBe("action");
        if (result.status === "action") {
            expect(result.action).toEqual({
                kind: "command",
                command: "r",
                count: 3,
                register: undefined,
                character: "x",
            });
        }
    });

    test("an operator can wait for a find character", () => {
        const result = parseKeys(["d", "f", "x"]);

        expect(result.status).toBe("action");
        if (result.status === "action") {
            expect(result.action).toEqual({
                kind: "operator",
                operator: "d",
                count: 1,
                register: undefined,
                target: {
                    kind: "motion",
                    motion: "f",
                    character: "x",
                },
            });
        }
    });

    test("counts before and after a doubled operator are multiplied", () => {
        const result = parseKeys(["2", "y", "3", "y"]);

        expect(result.status).toBe("action");
        if (result.status === "action") {
            expect(result.action).toEqual({
                kind: "operator",
                operator: "y",
                count: 6,
                register: undefined,
                target: { kind: "line" },
            });
        }
    });

    test("parses doubled indent operators and their counts", () => {
        expect(parseKeys([">", ">"])).toMatchObject({
            status: "action",
            action: {
                kind: "operator",
                operator: ">",
                count: 1,
                target: { kind: "line" },
            },
        });
        expect(parseKeys(["3", "<", "<"])).toMatchObject({
            status: "action",
            action: {
                kind: "operator",
                operator: "<",
                count: 3,
                target: { kind: "line" },
            },
        });
    });

    test("parses indent operators with motions", () => {
        expect(parseKeys([">", "}"])).toMatchObject({
            status: "action",
            action: {
                kind: "operator",
                operator: ">",
                count: 1,
                target: { kind: "motion", motion: "}" },
            },
        });
    });

    test("parses case operators with motions and text objects", () => {
        expect(parseKeys(["g", "~", "w"])).toMatchObject({
            status: "action",
            action: {
                kind: "operator",
                operator: "g~",
                target: { kind: "motion", motion: "w" },
            },
        });
        expect(parseKeys(["g", "u", "i", "w"])).toMatchObject({
            status: "action",
            action: {
                kind: "operator",
                operator: "gu",
                target: { kind: "text-object", textObject: "iw" },
            },
        });
        expect(parseKeys(["g", "U", "$"])).toMatchObject({
            status: "action",
            action: {
                kind: "operator",
                operator: "gU",
                target: { kind: "motion", motion: "$" },
            },
        });
    });

    test("parses shorthand and full linewise case operators", () => {
        for (const keys of [
            ["g", "~", "~"],
            ["g", "~", "g", "~"],
            ["g", "u", "u"],
            ["g", "u", "g", "u"],
            ["g", "U", "U"],
            ["g", "U", "g", "U"],
        ]) {
            expect(parseKeys(keys)).toMatchObject({
                status: "action",
                action: {
                    kind: "operator",
                    target: { kind: "line" },
                },
            });
        }
    });

    test("u and dot accept counts as commands", () => {
        const undo = parseKeys(["3", "u"]);
        const repeat = parseKeys(["2", "."]);

        expect(undo.status).toBe("action");
        expect(repeat.status).toBe("action");
        if (undo.status === "action") {
            expect(undo.action).toEqual({
                kind: "command",
                command: "u",
                count: 3,
                register: undefined,
            });
        }
        if (repeat.status === "action") {
            expect(repeat.action).toEqual({
                kind: "command",
                command: ".",
                count: 2,
                register: undefined,
            });
        }
    });

    test("J accepts a count as a command", () => {
        const result = parseKeys(["3", "J"]);

        expect(result.status).toBe("action");
        if (result.status === "action") {
            expect(result.action).toEqual({
                kind: "command",
                command: "J",
                count: 3,
                register: undefined,
            });
        }
    });

    test("n and N accept counts", () => {
        for (const command of ["n", "N"] as const) {
            expect(parseKeys(["3", command])).toMatchObject({
                status: "action",
                action: {
                    kind: "command",
                    command,
                    count: 3,
                },
            });
        }
    });

    test("* and # accept counts as word search commands", () => {
        for (const command of ["*", "#"] as const) {
            expect(parseKeys(["2", command])).toMatchObject({
                status: "action",
                action: {
                    kind: "command",
                    command,
                    count: 2,
                },
            });
        }
    });

    test("parses local mark commands", () => {
        for (const command of ["m", "`", "'"] as const) {
            expect(parseKeys([command, "a"])).toMatchObject({
                status: "action",
                action: {
                    kind: "command",
                    command,
                    character: "a",
                },
            });
        }
    });

    test("rejects invalid local mark names", () => {
        expect(parseKeys(["m", "A"]).status).toBe("invalid");
        expect(parseKeys(["`", "1"]).status).toBe("invalid");
    });

    test("Escape cancels pending input", () => {
        const result = parseKeys(["2", "d", "Escape"]);

        expect(result.status).toBe("cancelled");
        expect(result.state.keys).toBe("");
    });

    test("unsupported input resets the parser", () => {
        const result = parseKeys(["d", "?"]);

        expect(result.status).toBe("invalid");
        expect(result.state.keys).toBe("");
    });
});
