export type ExCommand =
    | { kind: "write" }
    | { kind: "quit" }
    | { kind: "write-quit" }
    | { kind: "home" }
    | { kind: "edit"; pageTitle: string }
    | {
          kind: "substitute";
          range: "current" | "all";
          pattern: string;
          replacement: string;
          flags: {
              global: boolean;
          };
      };

export type ExParseResult =
    | { status: "command"; command: ExCommand }
    | { status: "empty" }
    | { status: "invalid"; message: string };

export function parseExCommand(source: string): ExParseResult {
    const input = source.replace(/^:/u, "").trim();
    if (input === "") return { status: "empty" };

    const substitute = parseSubstituteCommand(input);
    if (substitute) return substitute;

    const [name = "", ...arguments_] = input.split(/\s+/u);
    switch (name) {
        case "w":
        case "write":
            return arguments_.length === 0
                ? { status: "command", command: { kind: "write" } }
                : { status: "invalid", message: "E488: Trailing characters" };
        case "q":
        case "quit":
            return arguments_.length === 0
                ? { status: "command", command: { kind: "quit" } }
                : { status: "invalid", message: "E488: Trailing characters" };
        case "wq":
        case "x":
            return arguments_.length === 0
                ? { status: "command", command: { kind: "write-quit" } }
                : { status: "invalid", message: "E488: Trailing characters" };
        case "home":
        case "qa":
            return arguments_.length === 0
                ? { status: "command", command: { kind: "home" } }
                : { status: "invalid", message: "E488: Trailing characters" };
        case "e":
        case "edit": {
            const pageTitle = arguments_.join(" ").trim();
            return pageTitle === ""
                ? { status: "invalid", message: "E471: Argument required" }
                : {
                      status: "command",
                      command: { kind: "edit", pageTitle },
                  };
        }
        default:
            return {
                status: "invalid",
                message: `E492: Not an editor command: ${name}`,
            };
    }
}

function parseSubstituteCommand(input: string): ExParseResult | null {
    const prefixes: Array<{ prefix: string; range: "current" | "all" }> = [
        { prefix: "%substitute", range: "all" },
        { prefix: "%s", range: "all" },
        { prefix: "substitute", range: "current" },
        { prefix: "s", range: "current" },
    ];
    const match = prefixes.find(({ prefix }) => input.startsWith(prefix));
    if (!match) return null;

    const delimiter = input[match.prefix.length];
    if (!delimiter || /[\s\p{L}\p{N}_]/u.test(delimiter)) return null;

    const pattern = readSubstitutePart(
        input,
        match.prefix.length + 1,
        delimiter,
    );
    if (!pattern) {
        return {
            status: "invalid",
            message: "E488: Trailing characters",
        };
    }
    if (pattern.value === "") {
        return {
            status: "invalid",
            message: "E476: Invalid command",
        };
    }

    const replacement = readSubstitutePart(input, pattern.next, delimiter, true);
    if (!replacement) {
        return {
            status: "invalid",
            message: "E488: Trailing characters",
        };
    }

    const flags = input.slice(replacement.next).trim();
    if (!/^[g]*$/u.test(flags)) {
        return {
            status: "invalid",
            message: `E488: Trailing characters: ${flags}`,
        };
    }

    return {
        status: "command",
        command: {
            kind: "substitute",
            range: match.range,
            pattern: pattern.value,
            replacement: replacement.value,
            flags: {
                global: flags.includes("g"),
            },
        },
    };
}

function readSubstitutePart(
    input: string,
    start: number,
    delimiter: string,
    allowEnd = false,
): { value: string; next: number } | null {
    let value = "";
    for (let index = start; index < input.length; index += 1) {
        const character = input[index];
        if (character === delimiter) {
            return { value, next: index + 1 };
        }
        if (character === "\\" && index + 1 < input.length) {
            const next = input[index + 1];
            if (next === delimiter || next === "\\") {
                value += next;
                index += 1;
                continue;
            }
        }
        value += character;
    }

    return allowEnd ? { value, next: input.length } : null;
}
