const THEME_STORAGE_KEY = "selected-theme";
const THEME_EVENT = "themechange";
const themeNames = ["system", "light", "dark"];
/**
 * Is the theme dark after accounting for system preference and manual setting.
 */
function isDark() {
    let theme = getTheme();
    if (theme === "system") {
        return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return theme === "dark";
}
/**
 * Get the currently set theme.
 */
function getTheme() {
    return localStorage.getItem(THEME_STORAGE_KEY) ?? "system";
}
/**
 * Set the theme and dispatch a set event.
 *
 * Will be a no-op if the theme is not changing unless force is passed.
 */
function setTheme(theme, force = false) {
    if (!force && getTheme() === theme) {
        return;
    }
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    if (theme === "system") {
        document.documentElement.removeAttribute("data-theme");
    }
    else {
        document.documentElement.setAttribute("data-theme", theme);
    }
    // Dispatch event for listeners
    window.dispatchEvent(new CustomEvent(THEME_EVENT, {
        detail: { theme },
    }));
}
/**
 * Generate a tri-state theme switcher.
 *
 * Returns a `HTMLDetailsElement` that can be added into the DOM. It requires
 * its corresponding css file to function. Styling designed to work seamlessly
 * with pico css, but as long as the correct css variables are defined, it will
 * work.
 */
function uiThemeSwitcher() {
    const initialTheme = getTheme();
    const selectEl = document.createElement("details");
    const summaryEl = document.createElement("summary");
    const listEl = document.createElement("ul");
    const setSummary = (theme) => {
        selectEl.title = `Change color theme (current: ${theme})`;
    };
    selectEl.append(summaryEl, listEl);
    selectEl.className = "dropdown br-theme-switcher";
    setSummary(initialTheme);
    for (const theme of themeNames) {
        const optEl = document.createElement("li");
        const linkEl = document.createElement("a");
        linkEl.href = "#";
        linkEl.title = theme;
        optEl.append(linkEl);
        listEl.append(optEl);
    }
    listEl.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const theme = e.target?.title;
        if (theme !== "") {
            setTheme(theme);
            selectEl.open = false;
        }
    });
    // TODO: Type this better?
    const handleThemeChange = (e) => {
        const theme = e.detail.theme;
        setSummary(theme);
    };
    window.addEventListener(THEME_EVENT, handleThemeChange);
    return selectEl;
}
// Initialize theme
// This should work if used in a module context
// TODO: Consider wrapping in DOMContentLoaded
setTheme(getTheme(), true);
export { uiThemeSwitcher, getTheme, setTheme, isDark };
//# sourceMappingURL=theme-switcher.js.map