import { describe, expect, test } from "bun:test";

import {
    changeCaseInRange,
    changeNumberAtOrAfter,
    characterRange,
    deleteCharacterRange,
    effectiveOperatorMotion,
    firstNonBlankChar,
    joinLines,
    leadingWhitespace,
    lineRange,
    linewiseValues,
    putCharacterwise,
    putCharacterwiseLines,
    rangeForMotion,
    shiftIndent,
    visualRange,
} from "./editing";

describe("editing ranges", () => {
    test("cw and cW become ce and cE on non-whitespace", () => {
        expect(effectiveOperatorMotion("c", "w", "o")).toBe("e");
        expect(effectiveOperatorMotion("c", "W", ".")).toBe("E");
        expect(effectiveOperatorMotion("c", "w", " ")).toBe("w");
        expect(effectiveOperatorMotion("d", "w", "o")).toBe("w");
    });

    test("builds forward and backward character ranges", () => {
        expect(characterRange(["abcd"], { line: 0, char: 1 }, 2)).toEqual({
            start: { line: 0, char: 1 },
            end: { line: 0, char: 3 },
            kind: "character",
        });
        expect(
            characterRange(["abcd"], { line: 0, char: 3 }, 2, true),
        ).toEqual({
            start: { line: 0, char: 1 },
            end: { line: 0, char: 3 },
            kind: "character",
        });
    });

    test("builds a clamped line range", () => {
        expect(lineRange(["a", "b"], 1, 3)).toEqual({
            start: { line: 1, char: 0 },
            end: { line: 1, char: 0 },
            kind: "line",
        });
    });

    test("builds exclusive and inclusive operator motion ranges", () => {
        expect(
            rangeForMotion(
                ["one two"],
                { line: 0, char: 0 },
                { line: 0, char: 4 },
                "w",
            ),
        ).toEqual({
            start: { line: 0, char: 0 },
            end: { line: 0, char: 4 },
            kind: "character",
        });
        expect(
            rangeForMotion(
                ["one two"],
                { line: 0, char: 0 },
                { line: 0, char: 2 },
                "e",
            ),
        ).toEqual({
            start: { line: 0, char: 0 },
            end: { line: 0, char: 3 },
            kind: "character",
        });
        expect(
            rangeForMotion(
                ["one)"],
                { line: 0, char: 0 },
                { line: 0, char: 2 },
                "t",
            ),
        ).toEqual({
            start: { line: 0, char: 0 },
            end: { line: 0, char: 3 },
            kind: "character",
        });
    });

    test("vertical operator motions are linewise", () => {
        expect(
            rangeForMotion(
                ["a", "b"],
                { line: 0, char: 0 },
                { line: 1, char: 0 },
                "j",
            ),
        ).toEqual({
            start: { line: 0, char: 0 },
            end: { line: 1, char: 0 },
            kind: "line",
        });
    });

    test("an exclusive motion to column zero excludes the destination line", () => {
        expect(
            rangeForMotion(
                ["  one", "two", "", "next"],
                { line: 0, char: 4 },
                { line: 2, char: 0 },
                "}",
            ),
        ).toEqual({
            start: { line: 0, char: 4 },
            end: { line: 1, char: 3 },
            kind: "character",
        });
    });

    test("an exclusive motion becomes linewise from first non-blank", () => {
        expect(
            rangeForMotion(
                ["  one", "two", "", "next"],
                { line: 0, char: 2 },
                { line: 2, char: 0 },
                "}",
            ),
        ).toEqual({
            start: { line: 0, char: 0 },
            end: { line: 1, char: 0 },
            kind: "line",
        });
    });
});

describe("insert start helpers", () => {
    test("finds the first non-blank grapheme", () => {
        expect(firstNonBlankChar("  日本")).toBe(2);
        expect(firstNonBlankChar("   ")).toBe(0);
    });

    test("preserves the current line indentation", () => {
        expect(leadingWhitespace(" \ttext")).toBe(" \t");
    });

    test("joins at least two lines and removes following indentation", () => {
        expect(joinLines(["one", "  two", "three"], 0, 1)).toEqual({
            text: "one two",
            cursorChar: 3,
            joinedLineCount: 2,
        });
    });

    test("joins count lines without adding unnecessary spaces", () => {
        expect(joinLines(["one ", "  two", ") three"], 0, 3)).toEqual({
            text: "one two) three",
            cursorChar: 3,
            joinedLineCount: 3,
        });
    });

    test("clamps joins and fails on the final line", () => {
        expect(joinLines(["one", "", "two"], 0, 9)).toEqual({
            text: "one two",
            cursorChar: 3,
            joinedLineCount: 3,
        });
        expect(joinLines(["one"], 0, 2)).toBeNull();
    });

    test("shifts non-empty lines right by one Cosense indent", () => {
        expect(shiftIndent("text", 1)).toBe("\ttext");
        expect(shiftIndent("", 1)).toBe("");
    });

    test("shifts one tab or up to four spaces left", () => {
        expect(shiftIndent("\ttext", -1)).toBe("text");
        expect(shiftIndent("    text", -1)).toBe("text");
        expect(shiftIndent("  text", -1)).toBe("text");
        expect(shiftIndent("text", -1)).toBe("text");
    });

    test("changes case only inside a characterwise range", () => {
        const range = {
            start: { line: 0, char: 1 },
            end: { line: 1, char: 2 },
            kind: "character" as const,
        };

        expect(changeCaseInRange(["aBc", "DeF"], range, "toggle")).toEqual([
            "abC",
            "dEF",
        ]);
        expect(changeCaseInRange(["aBc", "DeF"], range, "lower")).toEqual([
            "abc",
            "deF",
        ]);
        expect(changeCaseInRange(["aBc", "DeF"], range, "upper")).toEqual([
            "aBC",
            "DEF",
        ]);
    });

    test("changes complete lines for a linewise range", () => {
        expect(
            changeCaseInRange(
                ["Title", "one", "Two"],
                {
                    start: { line: 1, char: 0 },
                    end: { line: 2, char: 0 },
                    kind: "line",
                },
                "upper",
            ),
        ).toEqual(["Title", "ONE", "TWO"]);
    });

    test("increments the number under or after the cursor", () => {
        expect(changeNumberAtOrAfter("item 12 next 3", 5, 1)).toEqual({
            text: "item 13 next 3",
            cursorChar: 6,
        });
        expect(changeNumberAtOrAfter("item 12 next 3", 0, 2)).toEqual({
            text: "item 14 next 3",
            cursorChar: 6,
        });
    });

    test("supports decrement, signs, leading zeros, and large integers", () => {
        expect(changeNumberAtOrAfter("-2", 0, -3)).toEqual({
            text: "-5",
            cursorChar: 1,
        });
        expect(changeNumberAtOrAfter("007", 0, 1)).toEqual({
            text: "008",
            cursorChar: 2,
        });
        expect(
            changeNumberAtOrAfter("999999999999999999999", 0, 1),
        ).toEqual({
            text: "1000000000000000000000",
            cursorChar: 21,
        });
    });

    test("returns null when no number exists to the right", () => {
        expect(changeNumberAtOrAfter("abc", 0, 1)).toBeNull();
        expect(changeNumberAtOrAfter("1 abc", 2, 1)).toBeNull();
    });
});

describe("visual ranges", () => {
    test("characterwise Visual includes the cursor character", () => {
        expect(
            visualRange(
                ["abcd"],
                { line: 0, char: 1 },
                { line: 0, char: 2 },
                "character",
            ),
        ).toEqual({
            start: { line: 0, char: 1 },
            end: { line: 0, char: 3 },
            kind: "character",
        });
    });

    test("linewise Visual ignores character columns", () => {
        expect(
            visualRange(
                ["a", "b"],
                { line: 1, char: 1 },
                { line: 0, char: 0 },
                "line",
            ),
        ).toEqual({
            start: { line: 1, char: 0 },
            end: { line: 0, char: 0 },
            kind: "line",
        });
    });
});

describe("pure edits", () => {
    test("deletes graphemes without splitting emoji", () => {
        expect(
            deleteCharacterRange(["A😀B"], {
                start: { line: 0, char: 1 },
                end: { line: 0, char: 2 },
                kind: "character",
            }),
        ).toEqual({
            lines: ["AB"],
            cursor: { line: 0, char: 1 },
            deletedText: "😀",
        });
    });

    test("deletes a range across lines", () => {
        expect(
            deleteCharacterRange(["abc", "def"], {
                start: { line: 0, char: 1 },
                end: { line: 1, char: 2 },
                kind: "character",
            }),
        ).toEqual({
            lines: ["af"],
            cursor: { line: 0, char: 1 },
            deletedText: "bc\nde",
        });
    });

    test("puts characterwise before and after the cursor", () => {
        expect(putCharacterwise("abc", 1, "XY", true)).toEqual({
            text: "abXYc",
            cursorChar: 3,
        });
        expect(putCharacterwise("abc", 1, "XY", false)).toEqual({
            text: "aXYbc",
            cursorChar: 2,
        });
    });

    test("normalizes linewise register text", () => {
        expect(linewiseValues("one\ntwo\n")).toEqual(["one", "two"]);
    });

    test("puts a multiline characterwise value", () => {
        expect(
            putCharacterwiseLines(
                ["abcd", "next"],
                { line: 0, char: 1 },
                "X\nY",
                true,
            ),
        ).toEqual({
            lines: ["abX", "Ycd", "next"],
            cursor: { line: 1, char: 0 },
        });
    });
});
