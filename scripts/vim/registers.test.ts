import { describe, expect, test } from "bun:test";

import {
    RegisterStore,
    type ClipboardAdapter,
    type RegisterValue,
} from "./registers";

const character = (text: string): RegisterValue => ({
    text,
    kind: "character",
});

const line = (text: string): RegisterValue => ({
    text,
    kind: "line",
});

function createClipboard(initial = ""): ClipboardAdapter & {
    value: string;
} {
    return {
        value: initial,
        async readText() {
            return this.value;
        },
        async writeText(text) {
            this.value = text;
        },
    };
}

describe("yank registers", () => {
    test("an unnamed yank updates registers 0 and double quote", async () => {
        const registers = new RegisterStore(createClipboard());

        await registers.recordYank(character("word"));

        expect(await registers.read("0")).toEqual(character("word"));
        expect(await registers.read('"')).toEqual(character("word"));
    });

    test("an explicit yank updates the named and unnamed registers, not 0", async () => {
        const registers = new RegisterStore(createClipboard());
        await registers.recordYank(character("old"));

        await registers.recordYank(character("named"), "a");

        expect(await registers.read("a")).toEqual(character("named"));
        expect(await registers.read('"')).toEqual(character("named"));
        expect(await registers.read("0")).toEqual(character("old"));
    });

    test("an uppercase named register appends", async () => {
        const registers = new RegisterStore(createClipboard());
        await registers.recordYank(character("one"), "a");

        await registers.recordYank(character("two"), "A");

        expect(await registers.read("a")).toEqual(character("onetwo"));
        expect(await registers.read('"')).toEqual(character("onetwo"));
    });
});

describe("delete registers", () => {
    test("a small delete updates dash and unnamed", async () => {
        const registers = new RegisterStore(createClipboard());

        await registers.recordDelete(character("x"));

        expect(await registers.read("-")).toEqual(character("x"));
        expect(await registers.read('"')).toEqual(character("x"));
        expect(await registers.read("1")).toBeUndefined();
    });

    test("an explicit small delete skips the dash register", async () => {
        const registers = new RegisterStore(createClipboard());

        await registers.recordDelete(character("x"), { register: "a" });

        expect(await registers.read("a")).toEqual(character("x"));
        expect(await registers.read('"')).toEqual(character("x"));
        expect(await registers.read("-")).toBeUndefined();
        expect(await registers.read("1")).toBeUndefined();
    });

    test("line deletes rotate registers 1 through 9", async () => {
        const registers = new RegisterStore(createClipboard());

        await registers.recordDelete(line("first"));
        await registers.recordDelete(line("second"));

        expect(await registers.read("1")).toEqual(line("second\n"));
        expect(await registers.read("2")).toEqual(line("first\n"));
        expect(await registers.read('"')).toEqual(line("second\n"));
    });

    test("forced numbered deletes also update register 1 within a line", async () => {
        const registers = new RegisterStore(createClipboard());

        await registers.recordDelete(character("inside"), {
            forceNumbered: true,
        });

        expect(await registers.read("1")).toEqual(character("inside"));
    });
});

describe("special registers", () => {
    test("the black hole register changes nothing", async () => {
        const registers = new RegisterStore(createClipboard());
        await registers.recordYank(character("keep"));

        await registers.recordDelete(character("discard"), { register: "_" });

        expect(await registers.read('"')).toEqual(character("keep"));
        expect(await registers.read("_")).toBeUndefined();
    });

    test("+ and * share the browser clipboard", async () => {
        const clipboard = createClipboard();
        const registers = new RegisterStore(clipboard);

        await registers.recordYank(line("copied"), "+");

        expect(clipboard.value).toBe("copied\n");
        expect(await registers.read("*")).toEqual(line("copied\n"));
        expect(await registers.read('"')).toEqual(line("copied\n"));
    });

    test("clipboard errors are propagated without modifying unnamed", async () => {
        const clipboard: ClipboardAdapter = {
            readText: async () => {
                throw new Error("denied");
            },
            writeText: async () => {
                throw new Error("denied");
            },
        };
        const registers = new RegisterStore(clipboard);
        await registers.recordYank(character("keep"));

        await expect(
            registers.recordYank(character("blocked"), "+"),
        ).rejects.toThrow("denied");
        expect(await registers.read('"')).toEqual(character("keep"));
    });
});
