import { describe, expect, test } from "bun:test";

import { parseExCommand } from "./ex";

describe("Ex command parser", () => {
    test.each([
        [":w", { kind: "write" }],
        ["write", { kind: "write" }],
        [":q", { kind: "quit" }],
        [":wq", { kind: "write-quit" }],
        [":x", { kind: "write-quit" }],
        [":home", { kind: "home" }],
        [":qa", { kind: "home" }],
    ])("parses %s", (source, command) => {
        expect(parseExCommand(source)).toEqual({
            status: "command",
            command,
        });
    });

    test("preserves spaces in page titles", () => {
        expect(parseExCommand(":e 日本語 の ページ")).toEqual({
            status: "command",
            command: {
                kind: "edit",
                pageTitle: "日本語 の ページ",
            },
        });
    });

    test("parses substitute commands", () => {
        expect(parseExCommand(":s/one/two/")).toEqual({
            status: "command",
            command: {
                kind: "substitute",
                range: "current",
                pattern: "one",
                replacement: "two",
                flags: { global: false },
            },
        });
        expect(parseExCommand(":%s#one/two#three/four#g")).toEqual({
            status: "command",
            command: {
                kind: "substitute",
                range: "all",
                pattern: "one/two",
                replacement: "three/four",
                flags: { global: true },
            },
        });
    });

    test("supports escaped substitute delimiters", () => {
        expect(parseExCommand(":s/a\\/b/c\\\\d/")).toEqual({
            status: "command",
            command: {
                kind: "substitute",
                range: "current",
                pattern: "a/b",
                replacement: "c\\d",
                flags: { global: false },
            },
        });
    });

    test("reports empty and invalid commands", () => {
        expect(parseExCommand(":")).toEqual({ status: "empty" });
        expect(parseExCommand(":e")).toMatchObject({ status: "invalid" });
        expect(parseExCommand(":s//x/")).toMatchObject({ status: "invalid" });
        expect(parseExCommand(":unknown")).toMatchObject({
            status: "invalid",
        });
    });
});
