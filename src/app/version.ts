/**
 * Version numbers (Semantic Versioning, MAJOR.MINOR.PATCH):
 *   PATCH — bug fixes that make the existing behaviour correct;
 *   MINOR — deliberate behaviour or feature changes (new inputs, models, outputs, options);
 *   MAJOR — an overhaul that makes it a different thing (new simulation methods, many new variables,
 *           a changed AI API contract).
 * The site version is also in package.json (a test keeps them equal); each calculator carries its own
 * `version` in its def.ts. Changes are recorded in CHANGELOG.md (site) and each calculator's NOTES.md.
 */

/** The whole site: shell, core, styles and the set of calculators. */
export const APP_VERSION = '0.1.0';

/** The window.eeCalc / WebMCP contract that AI agents program against. */
export const API_VERSION = '0.1.0';
