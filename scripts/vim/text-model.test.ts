import { describe, expect, test } from "bun:test";

import {
    clampPosition,
    classifyCharacter,
    classifyWord,
    codeUnitOffsetAtGrapheme,
    comparePositions,
    getTextInRange,
    graphemeIndexAtCodeUnit,
    graphemeLength,
    normalizeRange,
    positionBefore,
    splitGraphemes,
    type TextRange,
} from "./text-model";

describe("position and range", () => {
    test("compares positions by line and then character", () => {
        expect(comparePositions({ line: 1, char: 0 }, { line: 0, char: 9 })).toBe(
            1,
        );
        expect(comparePositions({ line: 1, char: 2 }, { line: 1, char: 3 })).toBe(
            -1,
        );
    });

    test("normalizes a reversed range", () => {
        const range: TextRange = {
            start: { line: 2, char: 3 },
            end: { line: 1, char: 1 },
            kind: "character",
        };

        expect(normalizeRange(range)).toEqual({
            start: { line: 1, char: 1 },
            end: { line: 2, char: 3 },
            kind: "character",
        });
    });

    test("clamps a position to existing lines and graphemes", () => {
        expect(clampPosition(["abc", "日本"], { line: 9, char: 9 })).toEqual({
            line: 1,
            char: 2,
        });
        expect(clampPosition([], { line: 3, char: 4 })).toEqual({
            line: 0,
            char: 0,
        });
    });

    test("extracts a characterwise range across lines", () => {
        expect(
            getTextInRange(["abc", "日本語", "xyz"], {
                start: { line: 0, char: 1 },
                end: { line: 2, char: 2 },
                kind: "character",
            }),
        ).toBe("bc\n日本語\nxy");
    });

    test("extracts linewise text with a trailing newline", () => {
        expect(
            getTextInRange(["one", "two", "three"], {
                start: { line: 1, char: 2 },
                end: { line: 2, char: 0 },
                kind: "line",
            }),
        ).toBe("two\nthree\n");
    });

    test("finds the previous logical character position", () => {
        expect(positionBefore(["abc"], { line: 0, char: 2 })).toEqual({
            line: 0,
            char: 1,
        });
        expect(positionBefore(["abc", "def"], { line: 1, char: 0 })).toEqual({
            line: 0,
            char: 2,
        });
    });
});

describe("Unicode character boundaries", () => {
    test("keeps surrogate pairs and combining sequences intact", () => {
        expect(splitGraphemes("A😀e\u0301")).toEqual(["A", "😀", "e\u0301"]);
        expect(graphemeLength("A😀e\u0301")).toBe(3);
    });

    test("keeps an emoji ZWJ sequence as one character", () => {
        expect(graphemeLength("👨‍👩‍👧‍👦")).toBe(1);
    });

    test("converts between grapheme indexes and DOM string offsets", () => {
        const text = "A😀e\u0301";

        expect(codeUnitOffsetAtGrapheme(text, 2)).toBe(3);
        expect(graphemeIndexAtCodeUnit(text, 3)).toBe(2);
        expect(graphemeIndexAtCodeUnit(text, 4)).toBe(2);
    });
});

describe("word classification", () => {
    test("classifies ASCII and Japanese letters as keyword characters", () => {
        expect(classifyCharacter("a")).toBe("keyword");
        expect(classifyCharacter("_")).toBe("keyword");
        expect(classifyCharacter("日")).toBe("keyword");
    });

    test("classifies Cosense brackets and punctuation as punctuation", () => {
        expect(classifyCharacter("[")).toBe("punctuation");
        expect(classifyCharacter("]")).toBe("punctuation");
        expect(classifyCharacter(".")).toBe("punctuation");
    });

    test("WORD only distinguishes whitespace from non-whitespace", () => {
        expect(classifyWord(" ")).toBe("whitespace");
        expect(classifyWord("[")).toBe("word");
        expect(classifyWord("日")).toBe("word");
    });
});
