export class Runner {
    constructor(config) {
        this.name = config.name;
        this.color = config.color;
        this.lane = config.lane;
        this.type = 'HORSE'; // HORSE | EXCITER
        this.status = 'RUNNING'; // RUNNING, FALLING, STUNNED, FINISHED
        this.baseSpeed = 100;
        this.maxSpeed = 200 + Math.random() * 50;
        this.speed = 0;
        this.accel = 100;
        this.hp = 100;

        // Chaos
        this.inventory = [];
        this.stunTimer = 0;
        this.bobOffset = 0;
        this.animTimer = 0;
        this.emoji = '🐎';
        this.laneHeight = config.laneHeight || 100;
        this.laneIndex = config.laneIndex || 0;
    }

    update(dt) {
        if (this.status === 'RUNNING') {
            // Speed Mods
            let currentAccel = this.accel;
            let currentMaxSpeed = this.maxSpeed;

            if (this.type === 'EXCITER') {
                currentMaxSpeed *= 1.5;
                currentAccel *= 2;
                this.emoji = '🏍️';
            }

            // Accelerate
            if (this.speed < currentMaxSpeed) {
                this.speed += currentAccel * dt;
            }

            this.x += this.speed * dt;

            // Bobbing animation
            this.animTimer += dt * (this.type === 'EXCITER' ? 20 : 10);
            this.bobOffset = Math.sin(this.animTimer) * 3;
        } else if (this.status === 'STUNNED') {
            this.stunTimer -= dt;
            if (this.stunTimer <= 0) {
                this.status = 'RUNNING';
            }
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y + this.laneHeight / 2 + this.bobOffset);

        // Draw Name
        ctx.fillStyle = "white";
        ctx.font = "bold 14px 'Roboto'";
        ctx.textAlign = "center";

        // Draw Status Effect
        if (this.status === 'STUNNED') {
            ctx.fillText("💫", 0, -60);
        }

        ctx.fillText(this.name, 0, -40);

        // Draw Runner
        ctx.font = "40px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(this.emoji, 0, 0);

        // Draw HP Bar
        ctx.fillStyle = "red";
        ctx.fillRect(-20, 25, 40, 5);
        ctx.fillStyle = "#0f0";
        ctx.fillRect(-20, 25, 40 * (this.hp / 100), 5);

        ctx.restore();
    }
}

export class Item {
    constructor(x, y) {
        this.x = x;
        this.y = y; // lane center Y

        // Random Type based on distribution
        const rand = Math.random();
        if (rand < 0.6) this.type = 'ATTACK'; // Rock, Bomb, Gun
        else if (rand < 0.8) this.type = 'DEFENSE'; // Shield, Boost
        else this.type = 'TROLL'; // Banana, Hole

        this.specificType = this.getRandomSpecificType(this.type);
        this.width = 40;
        this.height = 40;
        this.collected = false;

        // Visual
        this.bobOffset = 0;
        this.animTimer = Math.random() * 10;
    }

    getRandomSpecificType(category) {
        if (category === 'ATTACK') {
            const r = Math.random();
            if (r < 0.4) return 'ROCK'; // 🪨
            if (r < 0.7) return 'GUN'; // 🔫
            return 'BOMB'; // 💣
        }
        if (category === 'DEFENSE') {
            return Math.random() < 0.5 ? 'SHIELD' : 'BOOST';
        }
        return 'BANANA'; // 🍌
    }

    update(dt) {
        this.animTimer += dt * 5;
        this.bobOffset = Math.sin(this.animTimer) * 5;
    }

    draw(ctx) {
        if (this.collected) return;

        ctx.save();
        ctx.translate(this.x, this.y + this.bobOffset);

        // Box Visual
        ctx.fillStyle = "#FFD700";
        ctx.strokeStyle = "black";
        ctx.lineWidth = 2;
        ctx.fillRect(-20, -20, 40, 40);
        ctx.strokeRect(-20, -20, 40, 40);

        // Question Mark
        ctx.fillStyle = "black";
        ctx.font = "bold 24px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("?", 0, 0);

        ctx.restore();
    }
}

export class Projectile {
    constructor(type, x, y, target, source) {
        this.type = type; // ROCK, BULLET, BOMB
        this.x = x;
        this.y = y;
        this.target = target; // Runner object
        this.source = source;
        this.speed = 400;
        this.active = true;

        // Ballistic logic for Rock/Bomb
        this.progress = 0;
        this.startX = x;
        this.startY = y;
    }

    update(dt) {
        if (!this.active) return;

        if (this.type === 'BULLET') {
            this.x += this.speed * 2 * dt;
            if (this.x > this.target.x) { // Simple "reached" check
                this.active = false;
                return true; // Hit
            }
        } else {
            // Parabola
            this.progress += dt * 2;
            if (this.progress >= 1) {
                this.active = false;
                return true; // Hit
            }

            // LERP X
            this.x = this.startX + (this.target.x - this.startX) * this.progress;
            // Arc Y
            const arcHeight = 100 * Math.sin(this.progress * Math.PI);
            this.y = this.startY + (this.target.y - this.startY) * this.progress - arcHeight;
        }
        return false;
    }

    draw(ctx) {
        if (!this.active) return;
        ctx.save();
        ctx.translate(this.x, this.y);

        ctx.font = "24px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        let char = '🪨';
        if (this.type === 'BULLET') char = '🤜';
        else if (this.type === 'BOMB') char = '💣';

        ctx.fillText(char, 0, 0);
        ctx.restore();
    }
}
