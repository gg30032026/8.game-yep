/**
 * Chaos Horse Racing - Main Entry Point
 */

import { Game } from './Game.js';

window.addEventListener('DOMContentLoaded', () => {
    console.log("🐴 CHAOS RACE INITIALIZED 🐴");

    // Initialize Game
    const game = new Game();

    // Debug Access
    window.game = game;
});
