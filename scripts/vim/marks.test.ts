import { describe, expect, test } from "bun:test";

import { MarkStore } from "./marks";

describe("local marks", () => {
    test("follows its line when lines are inserted before it", () => {
        const marks = new MarkStore();
        marks.set(
            "a",
            "page",
            [
                { id: "1", text: "one" },
                { id: "2", text: "two" },
            ],
            { line: 1, char: 1 },
        );

        expect(
            marks.get("a", "page", [
                { id: "0", text: "zero" },
                { id: "1", text: "one" },
                { id: "2", text: "two" },
            ]),
        ).toEqual({ line: 2, char: 1 });
    });

    test("adjusts its character after edits before the mark", () => {
        const marks = new MarkStore();
        marks.set(
            "a",
            "page",
            [{ id: "1", text: "abcd" }],
            { line: 0, char: 2 },
        );

        expect(
            marks.get("a", "page", [{ id: "1", text: "aXXbcd" }]),
        ).toEqual({ line: 0, char: 4 });
        expect(
            marks.get("a", "page", [{ id: "1", text: "acd" }]),
        ).toEqual({ line: 0, char: 1 });
    });

    test("does not move for edits after the mark", () => {
        const marks = new MarkStore();
        marks.set(
            "a",
            "page",
            [{ id: "1", text: "abcd" }],
            { line: 0, char: 1 },
        );

        expect(
            marks.get("a", "page", [{ id: "1", text: "abcXYZd" }]),
        ).toEqual({ line: 0, char: 1 });
    });

    test("removes a mark when its line is deleted", () => {
        const marks = new MarkStore();
        marks.set(
            "a",
            "page",
            [{ id: "1", text: "one" }],
            { line: 0, char: 1 },
        );

        expect(marks.get("a", "page", [])).toBeNull();
    });

    test("keeps marks separate by page", () => {
        const marks = new MarkStore();
        marks.set(
            "a",
            "one",
            [{ id: "1", text: "one" }],
            { line: 0, char: 1 },
        );
        marks.set(
            "a",
            "two",
            [{ id: "2", text: "two" }],
            { line: 0, char: 2 },
        );

        expect(
            marks.get("a", "one", [{ id: "1", text: "one" }]),
        ).toEqual({ line: 0, char: 1 });
        expect(
            marks.get("a", "two", [{ id: "2", text: "two" }]),
        ).toEqual({ line: 0, char: 2 });
    });
});
