import { describe, expect, test } from "bun:test";

import { getMotionTarget } from "./motions";

const lines = ["  alpha.beta", "日本語 test", "", "last"];

describe("basic motions", () => {
    test("h and l stay within the current line", () => {
        expect(getMotionTarget(lines, { line: 0, char: 0 }, "h", 2)).toEqual({
            line: 0,
            char: 0,
        });
        expect(getMotionTarget(lines, { line: 0, char: 9 }, "l", 9)).toEqual({
            line: 0,
            char: 11,
        });
    });

    test("j and k clamp the column to the destination line", () => {
        expect(getMotionTarget(lines, { line: 0, char: 9 }, "j", 1)).toEqual({
            line: 1,
            char: 7,
        });
        expect(getMotionTarget(lines, { line: 1, char: 4 }, "k", 1)).toEqual({
            line: 0,
            char: 4,
        });
        expect(
            getMotionTarget(
                lines,
                { line: 2, char: 0 },
                "j",
                1,
                false,
                { preferredColumn: 3 },
            ),
        ).toEqual({
            line: 3,
            char: 3,
        });
    });

    test("line motions support count", () => {
        expect(getMotionTarget(lines, { line: 0, char: 5 }, "0", 1)).toEqual({
            line: 0,
            char: 0,
        });
        expect(getMotionTarget(lines, { line: 0, char: 5 }, "^", 1)).toEqual({
            line: 0,
            char: 2,
        });
        expect(getMotionTarget(lines, { line: 0, char: 5 }, "$", 2)).toEqual({
            line: 1,
            char: 7,
        });
        expect(getMotionTarget(lines, { line: 0, char: 0 }, "|", 4)).toEqual({
            line: 0,
            char: 3,
        });
    });

    test("gg and G distinguish an omitted count from an explicit count", () => {
        expect(getMotionTarget(lines, { line: 1, char: 2 }, "gg", 1)).toEqual({
            line: 1,
            char: 0,
        });
        expect(getMotionTarget(lines, { line: 0, char: 2 }, "G", 1)).toEqual({
            line: 3,
            char: 0,
        });
        expect(
            getMotionTarget(lines, { line: 0, char: 2 }, "G", 2, true),
        ).toEqual({
            line: 1,
            char: 0,
        });
    });

    test("gg excludes the title line and falls back on title-only pages", () => {
        expect(
            getMotionTarget(["title", "body"], { line: 0, char: 0 }, "gg", 1),
        ).toEqual({ line: 1, char: 0 });
        expect(
            getMotionTarget(["title"], { line: 0, char: 2 }, "gg", 1),
        ).toEqual({ line: 0, char: 0 });
    });
});

describe("word motions", () => {
    test("w distinguishes keyword and punctuation runs", () => {
        expect(getMotionTarget(lines, { line: 0, char: 2 }, "w", 1)).toEqual({
            line: 0,
            char: 7,
        });
        expect(getMotionTarget(lines, { line: 0, char: 7 }, "w", 1)).toEqual({
            line: 0,
            char: 8,
        });
    });

    test("W treats all non-whitespace as one WORD", () => {
        expect(getMotionTarget(lines, { line: 0, char: 2 }, "W", 1)).toEqual({
            line: 1,
            char: 0,
        });
    });

    test("b and B move to previous starts", () => {
        expect(getMotionTarget(lines, { line: 0, char: 8 }, "b", 1)).toEqual({
            line: 0,
            char: 7,
        });
        expect(getMotionTarget(lines, { line: 1, char: 4 }, "B", 1)).toEqual({
            line: 1,
            char: 0,
        });
    });

    test("e and E move to word ends", () => {
        expect(getMotionTarget(lines, { line: 0, char: 2 }, "e", 1)).toEqual({
            line: 0,
            char: 6,
        });
        expect(getMotionTarget(lines, { line: 0, char: 2 }, "E", 1)).toEqual({
            line: 0,
            char: 11,
        });
    });

    test("ge and gE move to previous word ends", () => {
        expect(getMotionTarget(lines, { line: 0, char: 9 }, "ge", 1)).toEqual({
            line: 0,
            char: 7,
        });
        expect(getMotionTarget(lines, { line: 1, char: 0 }, "gE", 1)).toEqual({
            line: 0,
            char: 11,
        });
    });

    test("word motions cross lines and skip empty lines", () => {
        expect(getMotionTarget(lines, { line: 1, char: 4 }, "w", 1)).toEqual({
            line: 3,
            char: 0,
        });
    });

    test("e advances when already at the end of a word", () => {
        expect(getMotionTarget(lines, { line: 0, char: 6 }, "e", 1)).toEqual({
            line: 0,
            char: 7,
        });
    });
});

describe("find and structural motions", () => {
    test("f, F, t and T find characters on the current line", () => {
        const findLines = ["abc abc"];

        expect(
            getMotionTarget(
                findLines,
                { line: 0, char: 0 },
                "f",
                2,
                true,
                { character: "b" },
            ),
        ).toEqual({ line: 0, char: 5 });
        expect(
            getMotionTarget(
                findLines,
                { line: 0, char: 6 },
                "F",
                1,
                false,
                { character: "b" },
            ),
        ).toEqual({ line: 0, char: 5 });
        expect(
            getMotionTarget(
                findLines,
                { line: 0, char: 0 },
                "t",
                1,
                false,
                { character: "c" },
            ),
        ).toEqual({ line: 0, char: 1 });
        expect(
            getMotionTarget(
                findLines,
                { line: 0, char: 6 },
                "T",
                1,
                false,
                { character: "a" },
            ),
        ).toEqual({ line: 0, char: 5 });
    });

    test("; and , repeat the latest find in either direction", () => {
        const findLines = ["a-b-a"];
        const lastFind = {
            character: "a",
            direction: "forward" as const,
            till: false,
        };

        expect(
            getMotionTarget(
                findLines,
                { line: 0, char: 0 },
                ";",
                1,
                false,
                { lastFind },
            ),
        ).toEqual({ line: 0, char: 4 });
        expect(
            getMotionTarget(
                findLines,
                { line: 0, char: 4 },
                ",",
                1,
                false,
                { lastFind },
            ),
        ).toEqual({ line: 0, char: 0 });
    });

    test("% finds matching nested brackets", () => {
        const bracketLines = ["[a(b)c]"];

        expect(
            getMotionTarget(bracketLines, { line: 0, char: 0 }, "%", 1),
        ).toEqual({ line: 0, char: 6 });
        expect(
            getMotionTarget(bracketLines, { line: 0, char: 2 }, "%", 1),
        ).toEqual({ line: 0, char: 4 });
    });

    test("{ and } move between blank-line paragraph boundaries", () => {
        const paragraphLines = ["one", "two", "", "three", "", "five"];

        expect(
            getMotionTarget(paragraphLines, { line: 0, char: 0 }, "}", 1),
        ).toEqual({ line: 2, char: 0 });
        expect(
            getMotionTarget(paragraphLines, { line: 5, char: 0 }, "{", 1),
        ).toEqual({ line: 4, char: 0 });
    });
});
