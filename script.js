// ---------- Elements ----------
const display = document.getElementById("display");
const preview = document.getElementById("preview");
const historyPanel = document.getElementById("historyPanel");
const historyList = document.getElementById("historyList");
const historyToggle = document.getElementById("historyToggle");
const themeToggle = document.getElementById("themeToggle");

// ---------- State ----------
const OPERATORS = ["+", "−", "×", "÷", "^"];
const HISTORY_KEY = "calc-history";
const THEME_KEY = "calc-theme";
let history = loadHistory();
let justCalculated = false;
let pending = 0; // auto-added ")" at the end of the display

// ---------- Display helpers ----------
function setDisplay(value) {
    display.value = value;
    display.classList.toggle("small", value.length > 12);
    display.scrollLeft = display.scrollWidth;
    updatePreview();
}

function setPreview(text, isError = false) {
    preview.textContent = text;
    preview.classList.toggle("error", isError);
}

// Add missing ")" so "√(9" still works while typing
function closeBrackets(expression) {
    const open = (expression.match(/\(/g) || []).length;
    const close = (expression.match(/\)/g) || []).length;
    return expression + ")".repeat(Math.max(0, open - close));
}

// Show a live result while the user types
function updatePreview() {
    if (justCalculated) return;
    setPreview("");

    const expression = display.value;
    if (expression === "Error" || !/[+×÷^%√(]|.−/.test(expression)) return;

    try {
        const result = formatNumber(safeCalculate(closeBrackets(expression)));
        setPreview("= " + result);
    } catch (error) {
        // Incomplete expression: show nothing
    }
}

function formatNumber(number) {
    return String(Number(number.toPrecision(12))).replace("-", "−");
}

// ---------- Typing ----------
// Typing "(" adds "()" together. The extra ")" is "pending" until you type over it.
function getRaw() {
    return display.value.slice(0, display.value.length - pending);
}

function setRaw(raw) {
    setDisplay(raw + ")".repeat(pending));
}

function press(value) {

    if (display.value === "Error") {
        pending = 0;
        setDisplay("0");
    }

    // After "=": operators continue from the result, anything else starts fresh
    if (justCalculated) {
        justCalculated = false;
        if (!OPERATORS.includes(value) && value !== "%") {
            pending = 0;
            setDisplay("0");
        }
        setPreview("");
    }

    const current = getRaw();
    const last = current.slice(-1);
    const endsWithValue = /[\d)%]$/.test(current);

    // Digits
    if (/^\d$/.test(value)) {
        if (current === "0") return setRaw(value);
        if (last === ")" || last === "%") return setRaw(current + "×" + value);
        return setRaw(current + value);
    }

    // Decimal point (only one per number)
    if (value === ".") {
        const part = current.match(/[\d.]*$/)[0];
        if (part.includes(".")) return;
        if (last === ")" || last === "%") return setRaw(current + "×0.");
        if (part === "") return setRaw(current + "0.");
        return setRaw(current + ".");
    }

    // + − × ÷ ^
    if (OPERATORS.includes(value)) {
        if (current === "0") {
            return setRaw(value === "−" ? "−" : current + value);
        }
        if (OPERATORS.includes(last)) {
            // allow a negative sign after × ÷ ^ (example: 5×−2)
            if (value === "−" && "×÷^".includes(last)) return setRaw(current + value);
            return setRaw(current.replace(/[+−×÷^]+$/, value));
        }
        if (last === "(") {
            return value === "−" ? setRaw(current + value) : undefined;
        }
        return setRaw(current + value);
    }

    // Percent
    if (value === "%") {
        if (endsWithValue) setRaw(current + "%");
        return;
    }

    // Brackets: "(" adds both "(" and ")"
    if (value === "(") {
        pending++;
        if (current === "0") return setRaw("(");
        if (endsWithValue) return setRaw(current + "×(");
        return setRaw(current + "(");
    }

    // ")" types over the auto-added closing bracket
    if (value === ")") {
        if (pending > 0 && endsWithValue) {
            pending--;
            setRaw(current + ")");
        }
        return;
    }

    // Square root: adds "√()" with the bracket closed
    if (value === "√") {
        pending++;
        if (current === "0") return setRaw("√(");
        if (endsWithValue) return setRaw(current + "×√(");
        return setRaw(current + "√(");
    }
}

// Clear display
function clearDisplay() {
    justCalculated = false;
    pending = 0;
    setPreview("");
    setDisplay("0");
}

// Delete last character
function deleteNumber() {

    justCalculated = false;

    if (display.value === "Error") {
        return clearDisplay();
    }

    let raw = getRaw();

    if (raw.endsWith("√(")) {
        raw = raw.slice(0, -2);
        pending = Math.max(0, pending - 1);
    }
    else {
        const removed = raw.slice(-1);
        raw = raw.slice(0, -1);
        if (removed === "(") pending = Math.max(0, pending - 1);
        if (removed === ")") pending++;
    }

    if (raw === "" || raw === "−") {
        pending = 0;
        raw = "0";
    }

    setRaw(raw);
}

// ---------- Safe mathematical expression parser ----------
// Supports + − × ÷ ^ % √ and brackets. No eval() is used.
function safeCalculate(rawExpression) {

    const expression = rawExpression
        .replace(/×/g, "*")
        .replace(/÷/g, "/")
        .replace(/−/g, "-")
        .replace(/\s/g, "");

    const tokens = expression.match(
        /\d+\.?\d*|\.\d+|[()+\-*/%^√]/g
    );

    if (!tokens || tokens.join("") !== expression) {
        throw new Error("Invalid Expression");
    }

    let position = 0;

    function parseExpression() {

        let result = parseTerm();

        while (tokens[position] === "+" || tokens[position] === "-") {

            const operator = tokens[position++];
            const start = position;

            let next = parseTerm();

            // "200 + 10%" means 200 + 10% of 200 = 220
            if (position - start === 2 && tokens[position - 1] === "%") {
                next = result * next;
            }

            result = operator === "+" ? result + next : result - next;
        }

        return result;
    }

    function parseTerm() {

        let result = parseUnary();

        while (tokens[position] === "*" || tokens[position] === "/") {

            const operator = tokens[position++];
            const next = parseUnary();

            if (operator === "/" && next === 0) {
                throw new Error("Cannot divide by zero");
            }

            result = operator === "*" ? result * next : result / next;
        }

        return result;
    }

    function parseUnary() {

        if (tokens[position] === "+") {
            position++;
            return parseUnary();
        }

        if (tokens[position] === "-") {
            position++;
            return -parseUnary();
        }

        return parsePower();
    }

    // Power is right-associative: 2^3^2 = 2^(3^2)
    function parsePower() {

        const base = parsePostfix();

        if (tokens[position] === "^") {
            position++;
            return Math.pow(base, parseUnary());
        }

        return base;
    }

    // Percent: 50% = 0.5
    function parsePostfix() {

        let result = parsePrimary();

        while (tokens[position] === "%") {
            position++;
            result /= 100;
        }

        return result;
    }

    function parsePrimary() {

        const token = tokens[position++];

        if (token === "(") {

            const result = parseExpression();

            if (tokens[position++] !== ")") {
                throw new Error("Missing closing bracket");
            }

            return result;
        }

        if (token === "√") {

            const value = parsePrimary();

            if (value < 0) {
                throw new Error("Invalid square root");
            }

            return Math.sqrt(value);
        }

        const number = Number(token);

        if (token === undefined || !Number.isFinite(number)) {
            throw new Error("Invalid Number");
        }

        return number;
    }

    const result = parseExpression();

    if (position !== tokens.length) {
        throw new Error("Invalid Expression");
    }

    if (!Number.isFinite(result)) {
        throw new Error("Invalid Calculation");
    }

    return result;
}

// Calculate result
function calculate() {

    if (display.value === "Error" || justCalculated) return;

    try {

        const expression = closeBrackets(display.value);
        const result = formatNumber(safeCalculate(expression));

        addToHistory(expression, result);

        justCalculated = true;
        pending = 0;
        setDisplay(result);
        setPreview(expression + " =");

    }
    catch (error) {

        justCalculated = false;
        pending = 0;
        setDisplay("Error");
        setPreview(error.message, true);

    }
}

// ---------- History ----------
function loadHistory() {
    try {
        return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    } catch (error) {
        return [];
    }
}

function saveHistory() {
    try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (error) {
        // Storage not available: history just stays in memory
    }
}

function addToHistory(expression, result) {
    history.unshift({ expression, result });
    history = history.slice(0, 20);
    saveHistory();
    renderHistory();
}

function renderHistory() {

    historyList.textContent = "";

    if (history.length === 0) {
        const empty = document.createElement("li");
        empty.className = "empty";
        empty.textContent = "No calculations yet";
        historyList.appendChild(empty);
        return;
    }

    history.forEach((item) => {

        const row = document.createElement("li");
        const expr = document.createElement("span");
        const res = document.createElement("span");

        expr.className = "h-expr";
        expr.textContent = item.expression + " =";
        res.className = "h-result";
        res.textContent = item.result;

        row.append(expr, res);

        // Click an entry to reuse its result
        row.addEventListener("click", () => {
            justCalculated = false;
            pending = 0;
            setDisplay(item.result);
        });

        historyList.appendChild(row);
    });
}

historyToggle.addEventListener("click", () => {
    historyPanel.hidden = !historyPanel.hidden;
    historyToggle.setAttribute("aria-expanded", String(!historyPanel.hidden));
});

document.getElementById("clearHistory").addEventListener("click", () => {
    history = [];
    saveHistory();
    renderHistory();
});

// ---------- Theme ----------
function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    themeToggle.setAttribute("aria-checked", String(theme === "dark"));
    try {
        localStorage.setItem(THEME_KEY, theme);
    } catch (error) {
        // Ignore: theme just won't be remembered
    }
}

function initTheme() {
    let saved = null;
    try {
        saved = localStorage.getItem(THEME_KEY);
    } catch (error) {
        saved = null;
    }
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(saved || (prefersDark ? "dark" : "light"));
}

themeToggle.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(next);
});

// ---------- Button clicks ----------
document.querySelector(".buttons").addEventListener("click", (event) => {

    const button = event.target.closest("button");
    if (!button) return;

    const { value, action } = button.dataset;

    if (action === "clear") clearDisplay();
    else if (action === "delete") deleteNumber();
    else if (action === "equals") calculate();
    else if (value) press(value);
});

// ---------- Keyboard support ----------
const KEY_MAP = {
    "+": "+", "-": "−", "*": "×", "x": "×", "X": "×", "/": "÷",
    "^": "^", "%": "%", "(": "(", ")": ")", ".": ".", ",": ".", "r": "√", "R": "√"
};

document.addEventListener("keydown", (event) => {

    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const key = event.key;
    let selector = null;

    if (/^\d$/.test(key)) {
        press(key);
        selector = `[data-value="${key}"]`;
    }
    else if (KEY_MAP[key]) {
        press(KEY_MAP[key]);
        selector = `[data-value="${KEY_MAP[key]}"]`;
    }
    else if (key === "Enter" || key === "=") {
        calculate();
        selector = '[data-action="equals"]';
    }
    else if (key === "Backspace") {
        deleteNumber();
        selector = '[data-action="delete"]';
    }
    else if (key === "Escape" || key === "Delete") {
        clearDisplay();
        selector = '[data-action="clear"]';
    }
    else {
        return;
    }

    // Stop Enter/Space from also "clicking" a focused button
    event.preventDefault();

    // Flash the matching on-screen button
    const button = document.querySelector(selector);
    if (button) {
        button.classList.add("pressed");
        setTimeout(() => button.classList.remove("pressed"), 120);
    }
});

// ---------- Start ----------
initTheme();
renderHistory();
