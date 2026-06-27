export type RegisterKind = "character" | "line";

export type RegisterValue = {
    text: string;
    kind: RegisterKind;
};

export type ClipboardAdapter = {
    readText(): Promise<string>;
    writeText(text: string): Promise<void>;
};

export type DeleteOptions = {
    register?: string;
    forceNumbered?: boolean;
};

const unnamedRegister = '"';
const yankRegister = "0";
const smallDeleteRegister = "-";
const blackHoleRegister = "_";
const clipboardRegisters = new Set(["+", "*"]);
const namedRegisterPattern = /^[a-zA-Z]$/;
const numberedRegisterPattern = /^[0-9]$/;

export function createBrowserClipboard(): ClipboardAdapter {
    return {
        readText: () => navigator.clipboard.readText(),
        writeText: (text) => navigator.clipboard.writeText(text),
    };
}

function copyValue(value: RegisterValue): RegisterValue {
    return { ...value };
}

function normalizeValue(value: RegisterValue): RegisterValue {
    if (value.kind === "line" && !value.text.endsWith("\n")) {
        return {
            ...value,
            text: `${value.text}\n`,
        };
    }

    return copyValue(value);
}

function appendValues(
    previous: RegisterValue | undefined,
    next: RegisterValue,
): RegisterValue {
    if (!previous) return normalizeValue(next);

    const left = normalizeValue(previous);
    const right = normalizeValue(next);
    return {
        text: `${left.text}${right.text}`,
        kind:
            left.kind === "line" || right.kind === "line"
                ? "line"
                : "character",
    };
}

function clipboardValue(text: string): RegisterValue {
    return {
        text,
        kind: text.endsWith("\n") ? "line" : "character",
    };
}

export class RegisterStore {
    readonly #values = new Map<string, RegisterValue>();
    readonly #clipboard: ClipboardAdapter;

    constructor(clipboard: ClipboardAdapter = createBrowserClipboard()) {
        this.#clipboard = clipboard;
    }

    async read(register = unnamedRegister): Promise<RegisterValue | undefined> {
        if (register === blackHoleRegister) return undefined;

        if (clipboardRegisters.has(register)) {
            return clipboardValue(await this.#clipboard.readText());
        }

        const normalized = register.toLowerCase();
        const value = this.#values.get(normalized);
        return value ? copyValue(value) : undefined;
    }

    async recordYank(
        value: RegisterValue,
        register?: string,
    ): Promise<void> {
        const normalizedValue = normalizeValue(value);
        if (register === blackHoleRegister) return;

        if (register) {
            const written = await this.#writeExplicit(register, normalizedValue);
            this.#values.set(unnamedRegister, copyValue(written));
            return;
        }

        this.#values.set(yankRegister, copyValue(normalizedValue));
        this.#values.set(unnamedRegister, copyValue(normalizedValue));
    }

    async recordDelete(
        value: RegisterValue,
        options: DeleteOptions = {},
    ): Promise<void> {
        const normalizedValue = normalizeValue(value);
        const { register, forceNumbered = false } = options;
        if (register === blackHoleRegister) return;

        let written = normalizedValue;
        if (register) {
            written = await this.#writeExplicit(register, normalizedValue);
        }

        const isSmallDelete =
            normalizedValue.kind === "character" &&
            !normalizedValue.text.includes("\n") &&
            !forceNumbered;

        if (!register && isSmallDelete) {
            this.#values.set(smallDeleteRegister, copyValue(normalizedValue));
        } else if (!isSmallDelete || forceNumbered) {
            this.#rotateDeleteRegisters(normalizedValue);
        }

        this.#values.set(unnamedRegister, copyValue(written));
    }

    snapshot(): ReadonlyMap<string, RegisterValue> {
        return new Map(
            Array.from(this.#values, ([name, value]) => [
                name,
                copyValue(value),
            ]),
        );
    }

    async #writeExplicit(
        register: string,
        value: RegisterValue,
    ): Promise<RegisterValue> {
        if (clipboardRegisters.has(register)) {
            await this.#clipboard.writeText(value.text);
            return copyValue(value);
        }

        if (register === unnamedRegister) {
            this.#values.set(yankRegister, copyValue(value));
            return copyValue(value);
        }

        if (numberedRegisterPattern.test(register)) {
            this.#values.set(register, copyValue(value));
            return copyValue(value);
        }

        if (!namedRegisterPattern.test(register)) {
            throw new Error(`Unsupported register: ${register}`);
        }

        const normalized = register.toLowerCase();
        const written =
            register === register.toUpperCase()
                ? appendValues(this.#values.get(normalized), value)
                : copyValue(value);
        this.#values.set(normalized, copyValue(written));
        return written;
    }

    #rotateDeleteRegisters(value: RegisterValue): void {
        for (let index = 9; index >= 2; index -= 1) {
            const previous = this.#values.get(String(index - 1));
            if (previous) {
                this.#values.set(String(index), copyValue(previous));
            } else {
                this.#values.delete(String(index));
            }
        }

        this.#values.set("1", copyValue(value));
    }
}
