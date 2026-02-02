import { Runner } from './Entities.js';

export class Renderer {
    constructor(game) {
        this.game = game;
        this.canvas = document.getElementById('raceCanvas');
        this.ctx = this.canvas.getContext('2d');

        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.runners = [];
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    initRace(players, finishX) {
        // Create Runner entities based on players
        // Calculate lane height = canvas.height / 8
        this.finishX = finishX || 3000;
        console.log("Initializing Race with", players);
    }

    update(dt) {
        // Update positions, particles, animations
    }

    draw() {
        // Clear Screen
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // --- 1. BACKGROUND (Static 2D) ---
        // Sky (Solid Clear Blue)
        this.ctx.fillStyle = "#87CEEB";
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Clouds (Simple 2D shapes, moving slowly)
        this.drawClouds();

        // --- 2. TRACK (Side Scrolling) ---
        this.ctx.save();
        this.ctx.translate(-this.cameraX, 0);

        // Track Background (Grass top/bottom)
        this.ctx.fillStyle = "#4CAF50"; // Green Grass
        this.ctx.fillRect(this.cameraX, 0, this.canvas.width, this.canvas.height);

        // The Road/Track (Dirt Color)
        const trackHeight = this.laneHeight * 8;
        this.ctx.fillStyle = "#D7CCC8"; // Light Dirt/Sand
        this.ctx.fillRect(this.cameraX - 100, this.startY, this.canvas.width + 200 + 3000, trackHeight);

        // Lane Lines (Sharp White Dashes)
        this.ctx.strokeStyle = "rgba(255,255,255,0.8)";
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([20, 20]); // Dashed

        for (let i = 1; i < 8; i++) {
            const y = this.startY + (i * this.laneHeight);
            this.ctx.beginPath();
            this.ctx.moveTo(this.cameraX - 100, y);
            this.ctx.lineTo(this.cameraX + this.canvas.width + (this.finishX || 3000), y); // Draw far enough
            this.ctx.stroke();
        }
        this.ctx.setLineDash([]); // Reset dash

        // Finish Line (High Contrast Checkers)
        const finishX = this.finishX || 3000; // fallback if initRace was not called or updated
        this.drawCheckeredLine(finishX, this.startY, trackHeight);

        // --- 3. GAME OBJECTS ---

        // Items
        if (this.game.items) {
            this.game.items.forEach(i => i.draw(this.ctx));
        }

        // Runners
        this.runners.forEach(r => r.draw(this.ctx));

        this.ctx.restore();
    }

    drawClouds() {
        // Simple static clouds for now or slow move
        this.ctx.fillStyle = "white";
        // Cloud 1
        this.ctx.beginPath();
        this.ctx.arc(100, 50, 30, 0, Math.PI * 2);
        this.ctx.arc(150, 50, 40, 0, Math.PI * 2);
        this.ctx.arc(200, 50, 30, 0, Math.PI * 2);
        this.ctx.fill();

        // Cloud 2
        this.ctx.beginPath();
        this.ctx.arc(500, 80, 40, 0, Math.PI * 2);
        this.ctx.arc(560, 90, 50, 0, Math.PI * 2);
        this.ctx.arc(620, 80, 40, 0, Math.PI * 2);
        this.ctx.fill();
    }

    drawCheckeredLine(x, y, h) {
        const size = 20;
        const rows = Math.ceil(h / size);
        this.ctx.fillStyle = "white";
        this.ctx.fillRect(x, y, size * 2, h);

        this.ctx.fillStyle = "black";
        for (let r = 0; r < rows; r++) {
            // Checkered pattern
            if (r % 2 === 0) {
                this.ctx.fillRect(x, y + r * size, size, size); // Left col
            } else {
                this.ctx.fillRect(x + size, y + r * size, size, size); // Right col
            }
        }
    }
}
