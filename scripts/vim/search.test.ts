import { describe, expect, test } from "bun:test";

import {
    findAllSearchMatches,
    findSearchMatch,
    searchWordUnderCursor,
    substituteText,
} from "./search";

describe("Vim search", () => {
    const lines = ["title", "one two one", "日本語 one"];

    test("searches forward and wraps", () => {
        expect(
            findSearchMatch(lines, { line: 1, char: 0 }, "one", "forward"),
        ).toEqual({ line: 1, char: 8 });
        expect(
            findSearchMatch(lines, { line: 2, char: 4 }, "one", "forward"),
        ).toEqual({ line: 1, char: 0 });
    });

    test("searches backward and wraps", () => {
        expect(
            findSearchMatch(lines, { line: 1, char: 8 }, "one", "backward"),
        ).toEqual({ line: 1, char: 0 });
        expect(
            findSearchMatch(lines, { line: 1, char: 0 }, "one", "backward"),
        ).toEqual({ line: 2, char: 4 });
    });

    test("supports count and grapheme positions", () => {
        expect(
            findSearchMatch(
                lines,
                { line: 0, char: 0 },
                "one",
                "forward",
                3,
            ),
        ).toEqual({ line: 2, char: 4 });
    });

    test("returns null for an empty or missing query", () => {
        expect(
            findSearchMatch(lines, { line: 0, char: 0 }, "", "forward"),
        ).toBeNull();
        expect(
            findSearchMatch(lines, { line: 0, char: 0 }, "none", "forward"),
        ).toBeNull();
    });

    test("lists all matches for highlight rendering", () => {
        expect(findAllSearchMatches(lines, "one")).toEqual([
            { line: 1, char: 0, length: 3 },
            { line: 1, char: 8, length: 3 },
            { line: 2, char: 4, length: 3 },
        ]);
        expect(findAllSearchMatches(["あ🙂あ🙂"], "🙂")).toEqual([
            { line: 0, char: 1, length: 1 },
            { line: 0, char: 3, length: 1 },
        ]);
    });

    test("extracts the keyword word under or after the cursor", () => {
        expect(
            searchWordUnderCursor(["alpha-beta 縺ゅい"], {
                line: 0,
                char: 1,
            }),
        ).toBe("alpha");
        expect(
            searchWordUnderCursor(["alpha-beta 縺ゅい"], {
                line: 0,
                char: 5,
            }),
        ).toBe("beta");
        expect(
            searchWordUnderCursor(["alpha-beta 縺ゅい"], {
                line: 0,
                char: 11,
            }),
        ).toBe("縺ゅい");
        expect(searchWordUnderCursor(["---"], { line: 0, char: 0 })).toBeNull();
    });
});

describe("Vim substitute", () => {
    test("replaces the first match on selected lines by default", () => {
        expect(
            substituteText(["one one", "one"], {
                startLine: 0,
                endLine: 0,
                pattern: "one",
                replacement: "two",
                global: false,
            }),
        ).toEqual({
            lines: ["two one", "one"],
            count: 1,
            firstMatch: { line: 0, char: 0 },
        });
    });

    test("replaces all matches in the range with the global flag", () => {
        expect(
            substituteText(["one one", "one"], {
                startLine: 0,
                endLine: 1,
                pattern: "one",
                replacement: "two",
                global: true,
            }),
        ).toEqual({
            lines: ["two two", "two"],
            count: 3,
            firstMatch: { line: 0, char: 0 },
        });
    });

    test("reports no change when the pattern is missing", () => {
        expect(
            substituteText(["one"], {
                startLine: 0,
                endLine: 0,
                pattern: "none",
                replacement: "two",
                global: true,
            }),
        ).toEqual({
            lines: ["one"],
            count: 0,
            firstMatch: null,
        });
    });
});
