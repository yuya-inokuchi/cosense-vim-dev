import { describe, expect, test } from "bun:test";

import { createRepeatAction, isRepeatableChange } from "./repeat";

describe("repeat descriptor", () => {
    test("recognizes completed non-insert changes", () => {
        expect(
            isRepeatableChange({
                kind: "command",
                command: "x",
                count: 1,
                register: "a",
            }),
        ).toBeTrue();
        expect(
            isRepeatableChange({
                kind: "command",
                command: "ctrl-a",
                count: 3,
                register: undefined,
            }),
        ).toBeTrue();
        expect(
            isRepeatableChange({
                kind: "operator",
                operator: "gU",
                count: 1,
                register: undefined,
                target: { kind: "text-object", textObject: "iw" },
            }),
        ).toBeTrue();
        expect(
            isRepeatableChange({
                kind: "operator",
                operator: ">",
                count: 2,
                register: undefined,
                target: { kind: "line" },
            }),
        ).toBeTrue();
        expect(
            isRepeatableChange({
                kind: "command",
                command: "J",
                count: 2,
                register: undefined,
            }),
        ).toBeTrue();
        expect(
            isRepeatableChange({
                kind: "operator",
                operator: "d",
                count: 1,
                register: undefined,
                target: { kind: "motion", motion: "w" },
            }),
        ).toBeTrue();
    });

    test("does not record motions, yank, undo, or unfinished insert changes", () => {
        expect(
            isRepeatableChange({
                kind: "motion",
                motion: "w",
                count: 1,
                countSpecified: false,
            }),
        ).toBeFalse();
        expect(
            isRepeatableChange({
                kind: "operator",
                operator: "y",
                count: 1,
                register: undefined,
                target: { kind: "line" },
            }),
        ).toBeFalse();
        expect(
            isRepeatableChange({
                kind: "command",
                command: "u",
                count: 1,
                register: undefined,
            }),
        ).toBeFalse();
        expect(
            isRepeatableChange({
                kind: "operator",
                operator: "c",
                count: 1,
                register: undefined,
                target: { kind: "motion", motion: "w" },
            }),
        ).toBeFalse();
    });

    test("dot replaces the count while preserving register and target", () => {
        const original = {
            kind: "operator" as const,
            operator: "d" as const,
            count: 2,
            register: "a",
            target: { kind: "motion" as const, motion: "w" as const },
        };

        expect(createRepeatAction(original, 5)).toEqual({
            ...original,
            count: 5,
        });
        expect(original.count).toBe(2);
    });
});
