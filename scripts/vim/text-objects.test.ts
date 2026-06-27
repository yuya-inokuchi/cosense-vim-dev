import { describe, expect, test } from "bun:test";

import { getTextObjectRange } from "./text-objects";
import { getTextInRange } from "./text-model";

function selected(
    lines: string[],
    line: number,
    char: number,
    object: Parameters<typeof getTextObjectRange>[2],
    count = 1,
): string | null {
    const range = getTextObjectRange(lines, { line, char }, object, count);
    return range ? getTextInRange(lines, range) : null;
}

describe("word text objects", () => {
    test("iw and aw distinguish punctuation and surrounding whitespace", () => {
        const lines = ["one.two  next"];

        expect(selected(lines, 0, 1, "iw")).toBe("one");
        expect(selected(lines, 0, 1, "aw")).toBe("one");
        expect(selected(lines, 0, 4, "aw")).toBe("two  ");
    });

    test("iW and aW use whitespace-only boundaries", () => {
        const lines = ["one.two  next"];

        expect(selected(lines, 0, 3, "iW")).toBe("one.two");
        expect(selected(lines, 0, 3, "aW")).toBe("one.two  ");
    });

    test("count extends to following words", () => {
        expect(selected(["one two three"], 0, 1, "iw", 2)).toBe("one two");
    });
});

describe("quoted text objects", () => {
    test("inner and around quotes select expected text", () => {
        const lines = ['say "hello" now'];

        expect(selected(lines, 0, 6, 'i"')).toBe("hello");
        expect(selected(lines, 0, 6, 'a"')).toBe('"hello" ');
    });

    test("escaped quotes do not terminate the object", () => {
        const lines = ['"a\\"b"'];

        expect(selected(lines, 0, 3, 'i"')).toBe('a\\"b');
    });

    test("a quote after an even number of backslashes is not escaped", () => {
        const lines = ['"a\\\\" "b"'];

        expect(selected(lines, 0, 2, 'i"')).toBe("a\\\\");
    });
});

describe("bracket text objects", () => {
    test("selects the innermost nested block", () => {
        const lines = ["a(b[c]d)e"];

        expect(selected(lines, 0, 4, "i[")).toBe("c");
        expect(selected(lines, 0, 4, "a[")).toBe("[c]");
        expect(selected(lines, 0, 4, "ib")).toBe("b[c]d");
    });

    test("count selects an outer block", () => {
        const lines = ["((value))"];

        expect(selected(lines, 0, 3, "ib", 2)).toBe("(value)");
    });

    test("returns null for missing or empty inner blocks", () => {
        expect(selected(["plain"], 0, 1, "ib")).toBeNull();
        expect(selected(["()"], 0, 0, "ib")).toBeNull();
    });

    test("supports blocks spanning multiple Cosense lines", () => {
        const lines = ["start {", "inside", "} end"];

        expect(selected(lines, 1, 2, "iB")).toBe("\ninside\n");
    });
});

describe("paragraph text objects", () => {
    const lines = ["one", "two", "", "", "three", "four", "", "last"];

    test("ip selects non-blank paragraph lines", () => {
        expect(selected(lines, 1, 0, "ip")).toBe("one\ntwo\n");
    });

    test("ap includes trailing blank lines", () => {
        expect(selected(lines, 1, 0, "ap")).toBe("one\ntwo\n\n\n");
    });

    test("count includes following paragraphs", () => {
        expect(selected(lines, 0, 0, "ip", 2)).toBe(
            "one\ntwo\n\n\nthree\nfour\n",
        );
    });
});
