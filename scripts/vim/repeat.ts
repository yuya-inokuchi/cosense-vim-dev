import type { ParsedAction } from "./parser";

export type RepeatableChange = ParsedAction;

export function isRepeatableChange(
    action: ParsedAction,
): action is RepeatableChange {
    if (action.kind === "operator") {
        return action.operator === "d" ||
            action.operator === ">" ||
            action.operator === "<" ||
            action.operator === "g~" ||
            action.operator === "gu" ||
            action.operator === "gU";
    }
    if (action.kind !== "command") return false;
    return new Set([
        "x",
        "X",
        "p",
        "P",
        "D",
        "J",
        "ctrl-a",
        "ctrl-x",
        "r",
        "~",
    ]).has(action.command);
}

export function createRepeatAction(
    change: RepeatableChange,
    count: number,
): RepeatableChange {
    return {
        ...structuredClone(change),
        count,
    };
}
