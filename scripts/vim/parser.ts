export type VimOperator =
    | "c"
    | "d"
    | "y"
    | ">"
    | "<"
    | "g~"
    | "gu"
    | "gU";

export type VimMotion =
    | "h"
    | "j"
    | "k"
    | "l"
    | "0"
    | "^"
    | "$"
    | "|"
    | "w"
    | "b"
    | "e"
    | "W"
    | "B"
    | "E"
    | "ge"
    | "gE"
    | "gg"
    | "G"
    | "f"
    | "F"
    | "t"
    | "T"
    | ";"
    | ","
    | "%"
    | "{"
    | "}";

export type VimTextObject =
    | "iw"
    | "aw"
    | "iW"
    | "aW"
    | 'i"'
    | 'a"'
    | "i'"
    | "a'"
    | "i`"
    | "a`"
    | "i("
    | "a("
    | "i)"
    | "a)"
    | "ib"
    | "ab"
    | "i["
    | "a["
    | "i]"
    | "a]"
    | "i{"
    | "a{"
    | "i}"
    | "a}"
    | "iB"
    | "aB"
    | "ip"
    | "ap";

export type VimCommand =
    | "i"
    | "a"
    | "v"
    | "V"
    | "x"
    | "X"
    | "p"
    | "P"
    | "u"
    | "A"
    | "I"
    | "o"
    | "O"
    | "D"
    | "C"
    | "s"
    | "S"
    | "Y"
    | "J"
    | "m"
    | "`"
    | "'"
    | "ctrl-a"
    | "ctrl-x"
    | "n"
    | "N"
    | "*"
    | "#"
    | "r"
    | "."
    | "~";

export type ParserState = {
    keys: string;
    register?: string;
    count: string;
    operator?: VimOperator;
    operatorCount: string;
    prefix?: "g";
    textObjectPrefix?: "i" | "a";
    awaitingMotionCharacter?: "f" | "F" | "t" | "T";
    awaitingCommandCharacter?: "r" | "m" | "`" | "'";
    awaitingRegister: boolean;
};

export type ParsedAction =
    | {
          kind: "motion";
          motion: VimMotion;
          count: number;
          countSpecified: boolean;
          character?: string;
      }
    | {
          kind: "command";
          command: VimCommand;
          count: number;
          register?: string;
          character?: string;
      }
    | {
          kind: "operator";
          operator: VimOperator;
          count: number;
          register?: string;
          target:
              | { kind: "line" }
              | { kind: "motion"; motion: VimMotion; character?: string }
              | { kind: "text-object"; textObject: VimTextObject };
      };

export type ParserResult =
    | {
          status: "pending";
          state: ParserState;
      }
    | {
          status: "action";
          state: ParserState;
          action: ParsedAction;
      }
    | {
          status: "cancelled" | "invalid";
          state: ParserState;
      };

const operators = new Set<VimOperator>(["c", "d", "y", ">", "<"]);
const motions = new Set<VimMotion>([
    "h",
    "j",
    "k",
    "l",
    "0",
    "^",
    "$",
    "|",
    "w",
    "b",
    "e",
    "W",
    "B",
    "E",
    "G",
    ";",
    ",",
    "%",
    "{",
    "}",
]);
const prefixedMotions = new Set<VimMotion>(["ge", "gE", "gg"]);
const commands = new Set<VimCommand>([
    "i",
    "a",
    "v",
    "V",
    "x",
    "X",
    "p",
    "P",
    "u",
    "A",
    "I",
    "o",
    "O",
    "D",
    "C",
    "s",
    "S",
    "Y",
    "J",
    "n",
    "N",
    "*",
    "#",
    ".",
    "r",
    "~",
]);
const textObjects = new Set<VimTextObject>([
    "iw",
    "aw",
    "iW",
    "aW",
    'i"',
    'a"',
    "i'",
    "a'",
    "i`",
    "a`",
    "i(",
    "a(",
    "i)",
    "a)",
    "ib",
    "ab",
    "i[",
    "a[",
    "i]",
    "a]",
    "i{",
    "a{",
    "i}",
    "a}",
    "iB",
    "aB",
    "ip",
    "ap",
]);
const writableRegisters = /^[a-zA-Z0-9"_+*-]$/;

export function createParserState(): ParserState {
    return {
        keys: "",
        count: "",
        operatorCount: "",
        awaitingRegister: false,
    };
}

function withKey(state: ParserState, key: string): ParserState {
    return {
        ...state,
        keys: `${state.keys}${key}`,
    };
}

function parseCount(value: string): number {
    return value === "" ? 1 : Number.parseInt(value, 10);
}

function totalCount(state: ParserState): number {
    return parseCount(state.count) * parseCount(state.operatorCount);
}

function action(action: ParsedAction): ParserResult {
    return {
        status: "action",
        state: createParserState(),
        action,
    };
}

function invalid(): ParserResult {
    return {
        status: "invalid",
        state: createParserState(),
    };
}

function isCountDigit(key: string, currentCount: string): boolean {
    return /^[1-9]$/.test(key) || (key === "0" && currentCount !== "");
}

export function parseKey(state: ParserState, key: string): ParserResult {
    if (key === "Escape") {
        return {
            status: "cancelled",
            state: createParserState(),
        };
    }

    const next = withKey(state, key);

    if (state.awaitingRegister) {
        if (!writableRegisters.test(key)) return invalid();

        return {
            status: "pending",
            state: {
                ...next,
                register: key,
                awaitingRegister: false,
            },
        };
    }

    if (state.awaitingMotionCharacter) {
        if (state.operator) {
            return action({
                kind: "operator",
                operator: state.operator,
                count: totalCount(state),
                register: state.register,
                target: {
                    kind: "motion",
                    motion: state.awaitingMotionCharacter,
                    character: key,
                },
            });
        }

        return action({
            kind: "motion",
            motion: state.awaitingMotionCharacter,
            count: parseCount(state.count),
            countSpecified: state.count !== "",
            character: key,
        });
    }

    if (state.awaitingCommandCharacter) {
        if (
            state.awaitingCommandCharacter !== "r" &&
            !/^[a-z]$/u.test(key)
        ) {
            return invalid();
        }
        return action({
            kind: "command",
            command: state.awaitingCommandCharacter,
            count: parseCount(state.count),
            register: state.register,
            character: key,
        });
    }

    if (
        key === '"' &&
        state.keys === "" &&
        state.count === "" &&
        state.operator === undefined
    ) {
        return {
            status: "pending",
            state: {
                ...next,
                awaitingRegister: true,
            },
        };
    }

    if (state.textObjectPrefix) {
        const textObject = `${state.textObjectPrefix}${key}` as VimTextObject;
        if (!state.operator || !textObjects.has(textObject)) return invalid();

        return action({
            kind: "operator",
            operator: state.operator,
            count: totalCount(state),
            register: state.register,
            target: {
                kind: "text-object",
                textObject,
            },
        });
    }

    if (state.prefix === "g") {
        const prefixedOperator = `g${key}` as VimOperator;
        if (
            !state.operator &&
            (prefixedOperator === "g~" ||
                prefixedOperator === "gu" ||
                prefixedOperator === "gU")
        ) {
            return {
                status: "pending",
                state: {
                    ...next,
                    prefix: undefined,
                    operator: prefixedOperator,
                },
            };
        }

        if (state.operator && prefixedOperator === state.operator) {
            return action({
                kind: "operator",
                operator: state.operator,
                count: totalCount(state),
                register: state.register,
                target: { kind: "line" },
            });
        }

        const motion = `g${key}` as VimMotion;
        if (!prefixedMotions.has(motion)) return invalid();

        if (state.operator) {
            return action({
                kind: "operator",
                operator: state.operator,
                count: totalCount(state),
                register: state.register,
                target: { kind: "motion", motion },
            });
        }

        return action({
            kind: "motion",
            motion,
            count: parseCount(state.count),
            countSpecified: state.count !== "",
        });
    }

    if (state.operator) {
        if (isCountDigit(key, state.operatorCount)) {
            return {
                status: "pending",
                state: {
                    ...next,
                    operatorCount: `${state.operatorCount}${key}`,
                },
            };
        }

        const doubledOperatorKey = state.operator.startsWith("g")
            ? state.operator.slice(1)
            : state.operator;
        if (key === doubledOperatorKey) {
            return action({
                kind: "operator",
                operator: state.operator,
                count: totalCount(state),
                register: state.register,
                target: { kind: "line" },
            });
        }

        if (key === "i" || key === "a") {
            return {
                status: "pending",
                state: {
                    ...next,
                    textObjectPrefix: key,
                },
            };
        }

        if (key === "g") {
            return {
                status: "pending",
                state: {
                    ...next,
                    prefix: "g",
                },
            };
        }

        if (key === "f" || key === "F" || key === "t" || key === "T") {
            return {
                status: "pending",
                state: {
                    ...next,
                    awaitingMotionCharacter: key,
                },
            };
        }

        if (motions.has(key as VimMotion)) {
            return action({
                kind: "operator",
                operator: state.operator,
                count: totalCount(state),
                register: state.register,
                target: {
                    kind: "motion",
                    motion: key as VimMotion,
                },
            });
        }

        return invalid();
    }

    if (isCountDigit(key, state.count)) {
        return {
            status: "pending",
            state: {
                ...next,
                count: `${state.count}${key}`,
            },
        };
    }

    if (operators.has(key as VimOperator)) {
        return {
            status: "pending",
            state: {
                ...next,
                operator: key as VimOperator,
            },
        };
    }

    if (key === "f" || key === "F" || key === "t" || key === "T") {
        return {
            status: "pending",
            state: {
                ...next,
                awaitingMotionCharacter: key,
            },
        };
    }

    if (key === "r" || key === "m" || key === "`" || key === "'") {
        return {
            status: "pending",
            state: {
                ...next,
                awaitingCommandCharacter: key,
            },
        };
    }

    if (key === "g") {
        return {
            status: "pending",
            state: {
                ...next,
                prefix: "g",
            },
        };
    }

    if (motions.has(key as VimMotion)) {
        return action({
            kind: "motion",
            motion: key as VimMotion,
            count: parseCount(state.count),
            countSpecified: state.count !== "",
        });
    }

    if (commands.has(key as VimCommand)) {
        return action({
            kind: "command",
            command: key as VimCommand,
            count: parseCount(state.count),
            register: state.register,
        });
    }

    return invalid();
}

export function parseKeys(keys: readonly string[]): ParserResult {
    let result: ParserResult = {
        status: "pending",
        state: createParserState(),
    };

    for (const key of keys) {
        result = parseKey(result.state, key);
    }

    return result;
}
