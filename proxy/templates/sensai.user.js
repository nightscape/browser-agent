// ==UserScript==
// @name         SensAI Widget
// @namespace    https://sensai.dev
// @version      0.1.0
// @description  Inject SensAI chat assistant into any page
// @match        *://*/*
// @require      __SENSAI_SERVER__/sensai-widget.iife.js
// @run-at       document-idle
// ==/UserScript==

// __SENSAI_SERVER__ is replaced by the proxy when serving this file.
// For manual install, replace it with your server URL (e.g. "https://localhost:4222").
const SENSAI_SERVER = "__SENSAI_SERVER__";

window.SensAI?.init({ serverUrl: SENSAI_SERVER });
