type Theme = "system" | "light" | "dark";
/**
 * Is the theme dark after accounting for system preference and manual setting.
 */
declare function isDark(): boolean;
/**
 * Get the currently set theme.
 */
declare function getTheme(): Theme;
/**
 * Set the theme and dispatch a set event.
 *
 * Will be a no-op if the theme is not changing unless force is passed.
 */
declare function setTheme(theme: Theme, force?: boolean): void;
/**
 * Generate a tri-state theme switcher.
 *
 * Returns a `HTMLDetailsElement` that can be added into the DOM. It requires
 * its corresponding css file to function. Styling designed to work seamlessly
 * with pico css, but as long as the correct css variables are defined, it will
 * work.
 */
declare function uiThemeSwitcher(): HTMLDetailsElement;
export { uiThemeSwitcher, getTheme, setTheme, isDark, Theme };
//# sourceMappingURL=theme-switcher.d.ts.map