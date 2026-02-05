// --- 0. Security Helper ---
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// --- 1. Audio Manager ---
class AudioManager {
    constructor() {
        this.synth = window.speechSynthesis;
        // Background music
        this.bgMusic = new Audio('src/The Lone Ranger Theme Song - (320 Kbps).mp3');
        this.bgMusic.loop = true;
        this.bgMusic.volume = 1.0;
    }

    play(soundName) {
        if (soundName === 'start') {
            // Play background music when race starts
            this.bgMusic.currentTime = 0;
            this.bgMusic.play().catch(e => console.log('Audio play failed:', e));
        }
        if (soundName === 'win') {
            // Stop music when race ends
            this.bgMusic.pause();
            this.speak("Người chiến thắng!");
        }
    }

    speak(text) {
        if (this.synth.speaking) return;
        const utter = new SpeechSynthesisUtterance(text);
        this.synth.speak(utter);
    }

    stopMusic() {
        this.bgMusic.pause();
        this.bgMusic.currentTime = 0;
    }
}

// --- 2. Entities ---
class Horse {
    constructor(config) {
        this.name = config.name;
        this.color = config.color;
        this.lane = config.laneIndex;
        this.laneHeight = config.laneHeight;

        // Jockey Color
        this.jockeyColor = config.jockeyColor || "#FF0000"; // Default Red

        // Stats - reduced variance to keep horses closer together
        this.baseSpeed = 100 + Math.random() * 30; // Less variance = tighter pack
        this.maxSpeed = 280 + Math.random() * 60;  // Less variance for max too
        this.speed = 0;
        this.acceleration = 50 + Math.random() * 50;

        // Stamina / Fatigue System (Standard Racing Mechanics)
        this.stamina = 100;
        this.fatigueRate = 5 + Math.random() * 5;
        this.recoveryRate = 2;

        // Position
        this.x = 0;
        this.y = 0;

        // Visuals
        this.bobOffset = 0;
        this.animTimer = Math.random() * 100;
        this.gallopFrame = 0;

        // Collision State
        this.stunTimer = 0;
        this.isFalling = false;
        this.fallRotation = 0;
        this.slideVelocity = 0;
        this.recoveryGraceTimer = 0; // Grace period after standing up
        this.isMegaBoosting = false; // Track mega boost state

        // Attack animation (kick/headbutt)
        this.isAttacking = false;
        this.attackTimer = 0;
        this.attackType = 'kick'; // 'kick' or 'headbutt'

        // Particles for collision effects
        this.particles = [];

        // Race position tracking for rubber-banding
        this.racePosition = 0;
        this.distanceToLeader = 0;
    }

    update(dt, leaderX = 0, finishX = 3000, raceElapsed = 0) {
        // Update particles
        this.particles = this.particles.filter(p => {
            p.life -= dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 200 * dt; // gravity
            return p.life > 0;
        });

        // Update attack animation timer
        if (this.isAttacking) {
            this.attackTimer -= dt;
            if (this.attackTimer <= 0) {
                this.isAttacking = false;
            }
        }

        // 0. Stunned / Falling?
        if (this.stunTimer > 0) {
            this.stunTimer -= dt;
            this.speed = 0;

            // Fall animation
            if (this.isFalling) {
                this.fallRotation += dt * 5; // Rotate while falling
                if (this.fallRotation > Math.PI / 2) this.fallRotation = Math.PI / 2;
                this.x += this.slideVelocity * dt; // Slide forward from momentum
                this.slideVelocity *= 0.95; // Friction
            }

            // Smooth recovery animation when about to stand up (last 0.3s of stun)
            if (this.stunTimer <= 0.3 && this.stunTimer > 0) {
                this.isRecovering = true;
                // Smoothly rotate back to standing position
                this.fallRotation = this.fallRotation * 0.85; // Lerp towards 0
            }

            if (this.stunTimer <= 0) {
                this.isFalling = false;
                this.isRecovering = false;
                this.fallRotation = 0;
                this.recoveryGraceTimer = 2.0; // 2s grace period after standing
            }
            return;
        }

        // === RECOVERY GRACE PERIOD ===
        // Horse gradually accelerates after falling, no flying forward
        if (this.recoveryGraceTimer > 0) {
            this.recoveryGraceTimer -= dt;
            const recoveryProgress = 1 - (this.recoveryGraceTimer / 2.0);
            this.speed = this.baseSpeed * recoveryProgress * 0.7; // Max 70% speed
            this.x += this.speed * dt;
            if (this.fallRotation > 0.01) this.fallRotation *= 0.9;
            else this.fallRotation = 0;
            return;
        }

        // Smooth transition after stun ends
        if (this.fallRotation > 0.01) {
            this.fallRotation *= 0.9;
        } else {
            this.fallRotation = 0;
        }

        // 1. Stamina Management
        if (this.speed > this.baseSpeed * 1.2) {
            this.stamina -= this.fatigueRate * dt;
        } else {
            this.stamina += this.recoveryRate * dt;
        }
        this.stamina = Math.max(0, Math.min(100, this.stamina));

        // 2. Speed Calculation with COMEBACK MECHANICS
        let targetSpeed = this.baseSpeed;
        this.distanceToLeader = leaderX - this.x;
        const position = this.racePosition || 0;

        // === MEGA BOOST: Every 20 seconds, positions 35-36 get SUPER boost to reach top 3 ===
        const megaBoostCycle = Math.floor(raceElapsed / 20); // Which 20s cycle we're in
        const megaBoostWindow = raceElapsed % 20;
        const isMegaBoostTime = megaBoostWindow >= 0 && megaBoostWindow <= 7; // First 5 seconds of each 20s cycle

        if (isMegaBoostTime && (position >= 32 && position <= 35)) {
            // MEGA BOOST - make these horses fly to top 3!
            targetSpeed = this.maxSpeed * 4.5; // 3x max speed!
            this.stamina = 100; // Full stamina during boost
            if (!this.isMegaBoosting) {
                console.log(`🔥🔥 MEGA BOOST: ${this.name} (vị trí ${position + 1}) bứt phá thần tốc!`);
                this.isMegaBoosting = true;
            }
        } else {
            this.isMegaBoosting = false;
        }

        // === PERIODIC SURGE: Every 10 seconds, trailing horses get boost ===
        const surgeWindow = raceElapsed % 10;
        const isSurgeTime = surgeWindow >= 8 && surgeWindow <= 10;

        if (isSurgeTime) {
            // Trailing horses (position 3+) get surge chance
            if (position >= 3 && this.stamina > 20) {
                if (Math.random() < 0.5) {
                    targetSpeed = this.maxSpeed * 1.8;
                    if (!this.isSurging) {
                        this.isSurging = true;
                    }
                }
            }
            // Middle pack (position 1-2) also gets surge
            else if (position >= 1 && position <= 2 && this.stamina > 30) {
                if (Math.random() < 0.3) {
                    targetSpeed = this.maxSpeed * 1.5;
                }
            }
            // Leader might stumble during surge time
            if (position === 0 && Math.random() < 0.2) {
                targetSpeed = this.baseSpeed * 0.5;
            }
        } else {
            this.isSurging = false;
        }

        // === NATURAL RUBBER-BANDING (light, random) ===
        const distanceToFinish = finishX - this.x;
        const raceProgress = 1 - (distanceToFinish / finishX);
        const isLast30Seconds = raceProgress > 0.5; // Last half = last ~30s

        if (this.distanceToLeader > 300) {
            const boostFactor = Math.min(this.distanceToLeader / 500, 0.4);
            targetSpeed = Math.max(targetSpeed, this.baseSpeed * (1 + boostFactor));
        }

        // === LAST 30 SECONDS: CONSTANT POSITION CHANGES ===
        if (isLast30Seconds) {
            // Leader rotation every 5 seconds - leader gets tired
            const cycleTime = raceElapsed % 5;
            if (position === 0 && cycleTime < 1) {
                // First second of each 5s cycle - leader stumbles hard
                if (Math.random() < 0.4) {
                    targetSpeed = this.baseSpeed * 0.3; // Heavy slowdown!
                }
            }

            // Positions 2-5 get strong boost to challenge leader
            if (position >= 1 && position <= 4 && cycleTime >= 3) {
                if (Math.random() < 0.5) {
                    targetSpeed = this.maxSpeed * 1.4;
                }
            }

            // Random speed chaos for all - constant position changes
            if (Math.random() < 0.2) { // 20% each frame in final stretch
                if (Math.random() < 0.5) {
                    targetSpeed = this.maxSpeed * (1.1 + Math.random() * 0.3);
                } else {
                    targetSpeed = this.baseSpeed * (0.5 + Math.random() * 0.4);
                }
            }
        } else {
            // Normal random variations (not in final stretch)
            if (Math.random() < 0.08) {
                if (Math.random() < 0.5) {
                    targetSpeed = this.maxSpeed * (0.9 + Math.random() * 0.2);
                } else {
                    targetSpeed = this.baseSpeed * (0.7 + Math.random() * 0.3);
                }
            }
        }

        // === FINAL SPRINT: Last 500px - CHAOS ===
        if (distanceToFinish < 500 && distanceToFinish > 0) {
            // ALL positions can surge - pure chaos
            if (Math.random() < 0.35) {
                targetSpeed = this.maxSpeed * (1.5 + Math.random() * 1.0);
            }

            // Random slowdowns for leaders
            if (position <= 3 && Math.random() < 0.25) {
                targetSpeed = this.baseSpeed * 0.4;
            }
        }

        // Normal burst logic
        if (this.stamina > 20 && Math.random() < 0.03) {
            targetSpeed = this.maxSpeed;
        }

        // Fatigue penalty
        if (this.stamina < 10) {
            targetSpeed = this.baseSpeed * 0.5;
        }

        // 3. Movement
        if (this.speed < targetSpeed) {
            this.speed += this.acceleration * dt;
        } else {
            this.speed -= this.acceleration * dt;
        }

        this.x += this.speed * dt;

        // 4. Animation
        this.animTimer += dt * 10;
        this.bobOffset = Math.sin(this.animTimer) * 5;
        this.gallopFrame = Math.floor(this.animTimer) % 4;
    }

    draw(ctx) {
        // Draw particles first (behind horse)
        this.particles.forEach(p => {
            ctx.fillStyle = `rgba(139, 69, 19, ${p.life})`; // Brown dust
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.save();
        ctx.translate(this.x, this.y + this.laneHeight / 2 + this.bobOffset);

        // Falling Animation - now uses gradual rotation
        if (this.isFalling || this.stunTimer > 0) {
            ctx.rotate(this.fallRotation); // Gradual rotation
            ctx.translate(20 * (this.fallRotation / (Math.PI / 2)), -20 * (this.fallRotation / (Math.PI / 2)));
        }

        // Scale for the specified dimensions (Reference: Body ~120x70)
        // Adjust scale to fit lane height nicely
        const s = 0.5;
        ctx.scale(s, s);

        // === ATTACK ANIMATION (Kick/Headbutt) ===
        if (this.isAttacking) {
            // Draw impact lines radiating from front
            ctx.strokeStyle = "#FF4444";
            ctx.lineWidth = 4;
            const impactX = 80;
            const impactY = 0;
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI - Math.PI / 2;
                const len = 30 + Math.random() * 20;
                ctx.beginPath();
                ctx.moveTo(impactX, impactY);
                ctx.lineTo(impactX + Math.cos(angle) * len, impactY + Math.sin(angle) * len);
                ctx.stroke();
            }

            // Lean forward for attack
            ctx.rotate(-0.2);
        }

        // --- DRAW ORDER: Shadow -> Back Legs -> Tail -> Body -> Front Legs -> Neck/Head -> Mane -> Jockey ---

        // 1. Shadow (Oval #000 opacity 0.2)
        ctx.fillStyle = "rgba(0,0,0,0.2)";
        ctx.beginPath();
        ctx.ellipse(0, 70, 60, 15, 0, 0, Math.PI * 2);
        ctx.fill();

        // Common Stroke Style
        ctx.strokeStyle = "rgba(0,0,0,0.6)"; // Dark outline 
        ctx.lineWidth = 3;
        ctx.lineJoin = "round";

        // 2. Back Legs
        this.drawLeg(ctx, -45, 15, this.gallopFrame, true, 'HIND');
        this.drawLeg(ctx, 40, 15, this.gallopFrame + 2, true, 'FRONT');

        // 3. Tail (Curve, flying back)
        this.drawTail(ctx);

        // 4. Body (Oval 120x70)
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, 60, 35, 0, 0, Math.PI * 2); // 120x70 -> Radius 60x35
        ctx.fill();
        ctx.stroke();

        // 5. Neck & Head
        this.drawHeadNeck(ctx);

        // 6. Mane
        this.drawMane(ctx);

        // 7. Jockey (Riding on top)
        this.drawJockey(ctx);

        // 8. Near Legs
        this.drawLeg(ctx, -45, 15, this.gallopFrame + 1, false, 'HIND');
        this.drawLeg(ctx, 40, 15, this.gallopFrame + 3, false, 'FRONT');

        // 9. Name Tag (Above Jockey)
        ctx.save();
        ctx.fillStyle = "white";
        ctx.strokeStyle = "black";
        ctx.lineWidth = 4;
        ctx.font = "bold 24px Arial";
        ctx.textAlign = "center";

        const nameY = -100; // Above jockey head
        ctx.strokeText(this.name, 10, nameY);
        ctx.fillText(this.name, 10, nameY);
        ctx.restore();

        ctx.restore();
    }

    drawLeg(ctx, x, y, phase, isFar, type) {
        ctx.save();
        ctx.translate(x, y);

        // Cycle for running
        const cycle = (this.animTimer * 10 + phase) % (Math.PI * 2);
        let thighAngle = 0;
        let shinAngle = 0;

        // Simple Gallop Mechanics
        if (type === 'HIND') {
            // Kick back
            thighAngle = Math.sin(cycle) * 0.5 + 0.5; // Mostly back
            shinAngle = Math.sin(cycle - 0.5) * 0.5;
        } else {
            // Reach forward
            thighAngle = Math.sin(cycle + Math.PI) * 0.5 - 0.2;
            shinAngle = Math.sin(cycle + Math.PI - 0.5) * 0.5 + 0.5;
        }

        ctx.rotate(thighAngle);

        // Style
        ctx.fillStyle = isFar ? this.darken(this.color, 30) : this.color;
        // ctx.strokeStyle handled by child paths if needed or inherit? 
        // We need to stroke these.

        // Upper Leg (Thigh) - Rect ~40x15
        ctx.beginPath();
        ctx.roundRect(-7, 0, 14, 45, 5); // ~40-50 long
        ctx.fill();
        ctx.stroke();

        // Joint
        ctx.translate(0, 40);
        ctx.rotate(shinAngle);

        // Lower Leg (Shin)
        ctx.beginPath();
        ctx.roundRect(-6, 0, 12, 45, 5);
        ctx.fill();
        ctx.stroke();

        // Hoof (Oval black)
        ctx.translate(0, 45);
        ctx.fillStyle = "black";
        ctx.beginPath();
        ctx.ellipse(0, 5, 8, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    drawTail(ctx) {
        ctx.fillStyle = this.darken(this.color, 40); // Darker than body
        ctx.beginPath();
        ctx.moveTo(-50, 0);
        ctx.quadraticCurveTo(-90, -40 + Math.sin(this.animTimer * 15) * 10, -110, -10); // Flowing back
        ctx.quadraticCurveTo(-90, 10, -55, 10);
        ctx.fill();
        ctx.stroke();
    }

    drawHeadNeck(ctx) {
        // Neck (Trapezoid from body to head)
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.moveTo(30, -15); // Body join top
        ctx.lineTo(60, -60); // Head join top
        ctx.lineTo(45, -55); // Head join bottom
        ctx.lineTo(40, 10); // Body join bottom
        ctx.fill();
        ctx.stroke();

        // Head (Oval 50x40 -> R 25x20) at end of neck
        ctx.save();
        ctx.translate(55, -60);
        ctx.rotate(0.3); // Slight tilt down
        ctx.beginPath();
        ctx.ellipse(0, 0, 25, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Eye (Black dot)
        ctx.fillStyle = "black";
        ctx.beginPath();
        ctx.arc(5, -5, 3, 0, Math.PI * 2);
        ctx.fill();

        // Muzzle (Small oval at tip)
        ctx.fillStyle = this.darken(this.color, 20);
        ctx.beginPath();
        ctx.ellipse(20, 5, 6, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        // Ears
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.moveTo(-10, -15);
        ctx.lineTo(-5, -25);
        ctx.lineTo(0, -15);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }

    drawMane(ctx) {
        ctx.fillStyle = this.darken(this.color, 40);
        ctx.beginPath();
        // Along the neck
        ctx.moveTo(32, -18);
        ctx.lineTo(60, -60);
        // Spiky/Wavy back
        for (let i = 0; i < 5; i++) {
            ctx.lineTo(55 - i * 5, -45 + i * 5 + Math.sin(this.animTimer * 20 + i) * 5);
        }
        ctx.fill();
    }

    drawJockey(ctx) {
        // Position on back
        ctx.save();
        ctx.translate(10, -35); // Above body center

        // Legs (Pants) - Bent
        ctx.fillStyle = "white"; // Or player color? Spec says "White or same as shirt". Let's use White for contrast.
        ctx.strokeStyle = "black";

        ctx.beginPath();
        ctx.moveTo(0, 0); // Hip
        ctx.lineTo(5, 15); // Knee forward
        ctx.lineTo(-5, 25); // Foot back
        ctx.stroke();
        ctx.lineWidth = 10; // Thick leg
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.lineWidth = 3; // Reset stroke

        // Boot
        ctx.fillStyle = "black";
        ctx.fillRect(-8, 22, 12, 10);

        // Body (Oval/Rect ~40x50)
        // Spec: Lean forward
        ctx.rotate(0.3);
        ctx.fillStyle = this.jockeyColor || "red"; // Need to pass this in
        ctx.beginPath();
        ctx.roundRect(-15, -40, 30, 45, 10);
        ctx.fill();
        ctx.stroke();

        // Head
        ctx.translate(0, -45);
        ctx.fillStyle = "#FDBCB4"; // Skin
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Helmet
        ctx.fillStyle = this.jockeyColor || "red";
        ctx.beginPath();
        ctx.arc(0, -5, 15, Math.PI, 0); // Half circle top
        ctx.fill();
        ctx.stroke();

        // Arm (Reaching forward or SWINGING STICK)
        if (this.isAttacking) {
            // === JOCKEY SWINGING STICK ANIMATION ===
            const swingAngle = Math.sin(this.attackTimer * 15) * 0.8; // Fast swing

            ctx.save();
            ctx.translate(0, 10); // Shoulder position
            ctx.rotate(swingAngle - 0.5); // Swing arc

            // Arm
            ctx.strokeStyle = this.jockeyColor || "red";
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(30, 5);
            ctx.stroke();

            // STICK (Wooden bat)
            // STICK (Wooden bat) - LARGER AND MORE VISIBLE
            // GIANT STICK - 3X SIZE!
            ctx.strokeStyle = "#FFD700"; // Yellow glow behind
            ctx.lineWidth = 36; // 3x bigger glow
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(25, 5);
            ctx.lineTo(300, -75); // 3x longer stick!
            ctx.stroke();

            ctx.strokeStyle = "#8B4513"; // Brown wood
            ctx.lineWidth = 30; // 3x thicker!
            ctx.beginPath();
            ctx.moveTo(25, 5);
            ctx.lineTo(300, -75); // 3x longer stick!
            ctx.stroke();

            // Stick handle wrap
            ctx.strokeStyle = "#5D3A1A";
            ctx.lineWidth = 15; // 3x
            ctx.beginPath();
            ctx.moveTo(25, 5);
            ctx.lineTo(70, -10);
            ctx.stroke();

            // BIG Impact effect at stick tip - 3x bigger
            ctx.strokeStyle = "#FF0000";
            ctx.lineWidth = 8;
            for (let i = 0; i < 12; i++) {
                const angle = (i / 12) * Math.PI * 2;
                const len = 50 + Math.random() * 40; // 3x radius
                ctx.beginPath();
                ctx.moveTo(300, -75);
                ctx.lineTo(300 + Math.cos(angle) * len, -75 + Math.sin(angle) * len);
                ctx.stroke();
            }

            // "POW!" text effect - BIGGER
            ctx.fillStyle = "#FF0000";
            ctx.font = "bold 48px Coiny";
            ctx.fillText("💥", 280, -100);

            ctx.restore();
        } else {
            // Normal arm reaching forward
            ctx.strokeStyle = this.jockeyColor || "red";
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.moveTo(0, 10);
            ctx.lineTo(25, 20);
            ctx.stroke();
            ctx.lineWidth = 3;

            // Reins (Line to head)
            ctx.strokeStyle = "#5d4037";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(25, 20);
            ctx.lineTo(40, 20);
            ctx.stroke();
        }

        ctx.restore();
    }

    // Color helpers
    darken(col, amt) {
        return this.adjustColor(col, -amt);
    }
    lighten(col, amt) {
        return this.adjustColor(col, amt);
    }

    adjustColor(col, amt) {
        // Simple heuristic for Hex or Named colors? 
        // Real implementation is complex, let's stick to HSL if possible or simple HEX logic
        // If color is hex
        if (col.startsWith('#')) {
            let usePound = false;
            if (col[0] == "#") {
                col = col.slice(1);
                usePound = true;
            }
            let num = parseInt(col, 16);
            let r = (num >> 16) + amt;
            let b = ((num >> 8) & 0x00FF) + amt;
            let g = (num & 0x0000FF) + amt;
            if (r > 255) r = 255; else if (r < 0) r = 0;
            if (b > 255) b = 255; else if (b < 0) b = 0;
            if (g > 255) g = 255; else if (g < 0) g = 0;
            return (usePound ? "#" : "") + (g | (b << 8) | (r << 16)).toString(16);
        }
        // Fallback for names (return gray for shadow, white for light)
        if (amt < 0) return "#333";
        return "#fff";
    }
}

// --- 3. Renderer ---
class Renderer {
    constructor(game) {
        this.game = game;
        this.canvas = document.getElementById('raceCanvas');
        this.ctx = this.canvas.getContext('2d');

        this.width = 0;
        this.height = 0;

        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.runners = [];
        this.cameraX = 0;
        this.startY = 200;
        this.laneHeight = 100;
    }

    resize() {
        // FORCE High Resolution (min 2x for Retina/Sharpness)
        const dpr = Math.max(window.devicePixelRatio || 2, 2);

        // 1. Logical Size (Screen size)
        this.width = window.innerWidth;

        // Calculate required height for players - dynamic per-lane height
        // For 70 horses, use smaller lanes (20px) to fit on screen
        const numPlayers = (this.game.players && this.game.players.length > 0) ? this.game.players.length : 8;
        const laneHeightEstimate = Math.max(20, Math.min(80, Math.floor((window.innerHeight - 150) / numPlayers)));
        const requiredHeight = (numPlayers * laneHeightEstimate) + 150;

        // Use greater of Window height or Required height
        this.height = Math.max(window.innerHeight, requiredHeight);

        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;

        this.canvas.style.width = `${this.width}px`;
        this.canvas.style.height = `${this.height}px`;

        this.ctx.scale(dpr, dpr);
        // We want smooth curves for vector art style
        this.ctx.imageSmoothingEnabled = true;

        this.laneHeight = laneHeightEstimate; // Dynamic lane height
        this.startY = 80;

        console.log(`RESIZE: ${this.width}x${this.height} @ ${dpr}x, lanes=${numPlayers}, laneHeight=${this.laneHeight}`);
    }

    initRace(players) {
        this.resize();

        // === DYNAMIC LANE HEIGHT: Fit all horses inside track ===
        const trackTopMargin = 80; // Space for timer/HUD
        const trackBottomMargin = 50; // Space at bottom
        const availableHeight = this.height - trackTopMargin - trackBottomMargin;

        // Calculate lane height to fit ALL players - no minimum, allow overlap/small lanes
        const numPlayers = players.length;
        // Remove min limit - let lanes be as small as needed to fit all horses
        // Max 80px for comfort, but can go down to 10px if needed for 70+ horses
        this.laneHeight = Math.max(10, Math.min(80, Math.floor(availableHeight / numPlayers)));
        this.startY = trackTopMargin;

        console.log(`TRACK: ${numPlayers} players, laneHeight=${this.laneHeight}px, availableHeight=${availableHeight}px`);

        // Shuffle players to randomize lane positions
        const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);

        this.runners = shuffledPlayers.map((p, i) => {
            const horse = new Horse({
                name: p.name,
                color: p.color,
                jockeyColor: p.jockeyColor,
                laneIndex: i,
                laneHeight: this.laneHeight
            });
            horse.y = this.startY + (i * this.laneHeight);
            return horse;
        });
    }

    update(dt) {
        const finishX = this.game.finishX || 3000; // Use dynamic finishX from game
        let leaderX = 0;
        if (this.runners.length > 0) {
            const leader = this.runners.reduce((max, r) => r.x > max.x ? r : max, this.runners[0]);
            leaderX = leader.x;
            // Smooth Camera
            const targetX = leader.x - this.width * 0.3;
            this.cameraX += (Math.max(0, targetX) - this.cameraX) * 0.1;
        }
        // Pass leaderX and finishX to each horse for comeback mechanics
        this.runners.forEach(r => r.update(dt, leaderX, finishX, this.game.elapsedTime || 0));
    }

    draw() {
        // Clear
        this.ctx.clearRect(0, 0, this.width, this.height);

        // 1. SKY (Gradient)
        const grad = this.ctx.createLinearGradient(0, 0, 0, this.height);
        grad.addColorStop(0, "#87CEEB");
        grad.addColorStop(0.5, "#E0F7FA");
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(0, 0, this.width, this.height);

        // SCENERY (Grandstand, Trees)
        this.drawBackgroundScenery();

        // 2. TRACK
        this.ctx.save();
        this.ctx.translate(-this.cameraX, 0);

        // Grass Background (#32CD32)
        this.ctx.fillStyle = "#32CD32"; // Requested Green
        this.ctx.fillRect(this.cameraX, 0, this.width, this.height);

        // Dirt Track Surface - DYNAMIC based on actual number of runners
        const trackHeight = this.laneHeight * this.runners.length;
        this.ctx.fillStyle = "#D2B48C"; // Tan/Dirt color
        // Draw track wide enough to cover race
        this.ctx.fillRect(this.cameraX - 100, this.startY, this.width + 200 + 5000, trackHeight);

        // Fences (Top and Bottom)
        this.drawFences(this.startY - 30);
        this.drawFences(this.startY + trackHeight + 10);

        // Lane Lines - for ALL runners
        this.ctx.beginPath();
        this.ctx.strokeStyle = "rgba(255,255,255,0.4)";
        this.ctx.lineWidth = 2;
        for (let i = 0; i <= this.runners.length; i++) {
            const y = this.startY + (i * this.laneHeight);
            this.ctx.moveTo(this.cameraX - 100, y);
            this.ctx.lineTo(this.cameraX + this.width + 5000, y);
        }
        this.ctx.stroke();

        // Finish Line - use dynamic finishX from game
        const finishX = this.game.finishX || 3000;
        this.drawFinishLine(finishX, this.startY, trackHeight);

        // Distance Markers
        this.drawDistanceMarkers(finishX);

        // 3. HORSES
        // Sort by Y to handle pseudo-3D overlap (User request: 3D effect)
        // Since we translate Y for lanes, higher index = lower on screen = closer to camera
        // So drawing in order of lane index (0 to 7) naturally handles Z-order if they overlap vertically
        this.runners.forEach(r => r.draw(this.ctx));

        this.ctx.restore();
    }

    drawBackgroundScenery() {
        // Static background elements
        // ... (No change mostly, maybe loop trees more?)
        // Let's keep existing logic, it generates statically. 
        // Ideally should generate based on cameraX or track length.
        // For 10000m, keep it simple.

        // Grandstand (Grey structure)
        this.ctx.fillStyle = "#555";
        this.ctx.fillRect(50, this.height - 350, 400, 150); // Simple block
        // Roof
        this.ctx.fillStyle = "#333";
        this.ctx.beginPath();
        this.ctx.moveTo(40, this.height - 350);
        this.ctx.lineTo(460, this.height - 350);
        this.ctx.lineTo(400, this.height - 400);
        this.ctx.lineTo(100, this.height - 400);
        this.ctx.fill();

        // Trees (Green Ovals)
        this.ctx.fillStyle = "#228B22"; // Forest Green
        // Draw trees along the whole track length
        const farEdge = this.cameraX + this.width + 200;
        const startX = Math.floor((this.cameraX - 500) / 300) * 300;

        for (let x = startX; x < farEdge; x += 300) {
            // Random Y perturbation
            const y = this.startY - 100;
            if (x > 100) {
                this.ctx.beginPath();
                this.ctx.ellipse(x, y, 40, 60, 0, 0, Math.PI * 2);
                this.ctx.fill();
                // Trunk
                this.ctx.fillStyle = "#8B4513";
                this.ctx.fillRect(x - 10, y + 50, 20, 40);
                this.ctx.fillStyle = "#228B22";
            }
        }
    }

    drawFences(y) {
        // Draw a simple fence line
        this.ctx.fillStyle = "#8B4513"; // Brown fence posts
        this.ctx.strokeStyle = "#5D3A1A";
        this.ctx.lineWidth = 2;

        const postSpacing = 100;
        const startX = Math.floor(this.cameraX / postSpacing) * postSpacing;
        const endX = this.cameraX + this.width + 200;

        // Horizontal rails
        this.ctx.fillStyle = "#D2691E";
        this.ctx.fillRect(this.cameraX - 100, y, endX - this.cameraX + 200, 8);
        this.ctx.fillRect(this.cameraX - 100, y + 15, endX - this.cameraX + 200, 8);

        // Vertical posts
        this.ctx.fillStyle = "#8B4513";
        for (let x = startX; x < endX; x += postSpacing) {
            this.ctx.fillRect(x - 5, y - 10, 10, 40);
        }
    }

    drawFinishLine(x, y, h) {
        // === ENHANCED FINISH LINE ===
        const postWidth = 15;
        const bannerWidth = 200;
        const bannerHeight = 50;

        // Animated glow effect
        const glowIntensity = 0.5 + 0.3 * Math.sin(Date.now() / 200);
        this.ctx.shadowColor = '#FFD700';
        this.ctx.shadowBlur = 20 * glowIntensity;

        // Left Post (Tall)
        this.ctx.fillStyle = "#222";
        this.ctx.fillRect(x - 5, y - 80, postWidth, h + 100);

        // Right Post
        this.ctx.fillRect(x + bannerWidth - 10, y - 80, postWidth, h + 100);

        // Top Banner Bar
        this.ctx.fillStyle = "#C00";
        this.ctx.fillRect(x - 5, y - 80, bannerWidth + 10, bannerHeight);

        // "FINISH" Text (Large)
        this.ctx.fillStyle = "white";
        this.ctx.font = "bold 32px Coiny, sans-serif";
        this.ctx.textAlign = "center";
        this.ctx.fillText("🏁 FINISH 🏁", x + bannerWidth / 2, y - 45);

        // Reset shadow
        this.ctx.shadowBlur = 0;

        // Checkered Pattern on Ground (Wider)
        const size = 25;
        const columns = 8; // More columns for visibility

        for (let c = 0; c < columns; c++) {
            for (let r = 0; r < h / size; r++) {
                const isWhite = (r + c) % 2 === 0;
                this.ctx.fillStyle = isWhite ? "white" : "black";
                this.ctx.fillRect(x + c * size, y + r * size, size, size);
            }
        }

        // Animated Checkered Flag at top
        const flagX = x + bannerWidth / 2 - 30;
        const flagY = y - 120;
        const flagWave = Math.sin(Date.now() / 150) * 5;

        this.ctx.save();
        this.ctx.translate(flagX, flagY);
        this.ctx.rotate(flagWave * 0.02);

        // Flag pole
        this.ctx.fillStyle = "#555";
        this.ctx.fillRect(-3, 0, 6, 50);

        // Flag
        for (let fx = 0; fx < 4; fx++) {
            for (let fy = 0; fy < 3; fy++) {
                const isWhite = (fx + fy) % 2 === 0;
                this.ctx.fillStyle = isWhite ? "white" : "black";
                this.ctx.fillRect(3 + fx * 15, -30 + fy * 10 + Math.sin(Date.now() / 100 + fx) * 2, 15, 10);
            }
        }
        this.ctx.restore();
    }

    drawDistanceMarkers(maxX) {
        this.ctx.fillStyle = "rgba(255,255,255,0.7)";
        this.ctx.font = "bold 40px Roboto";
        this.ctx.textAlign = "center";

        for (let x = 500; x < maxX; x += 500) {
            // Only draw if visible
            if (x > this.cameraX - 100 && x < this.cameraX + this.width + 100) {
                this.ctx.fillText(`${x}m`, x, this.startY + this.laneHeight * 4); // Middle of track
            }
        }
    }

    drawClouds() {
        this.ctx.fillStyle = "rgba(255,255,255,0.8)";
        // Static background clouds
        this.ctx.beginPath();
        this.ctx.arc(100, 50, 40, 0, Math.PI * 2);
        this.ctx.arc(160, 60, 50, 0, Math.PI * 2);
        this.ctx.arc(220, 50, 40, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.beginPath();
        this.ctx.arc(600, 80, 60, 0, Math.PI * 2);
        this.ctx.arc(700, 70, 70, 0, Math.PI * 2);
        this.ctx.fill();
    }
}

// --- 4. Game ---
class Game {
    constructor() {
        this.state = 'LOBBY';
        this.renderer = new Renderer(this);
        this.audio = new AudioManager();

        this.players = [];
        this.lastTime = 0;

        // Race configuration
        this.raceDuration = 60; // Default 60 seconds (1 minute)
        this.finishX = 12000; // Will be calculated based on raceDuration (duration * 200)
        this.raceStartTime = 0; // Track when race started
        this.elapsedTime = 0; // Track elapsed race time

        this.initLobbyEvents();
        this.loop = this.loop.bind(this);
        requestAnimationFrame(this.loop);
    }

    initLobbyEvents() {
        // Load players from localStorage or use defaults
        const savedPlayers = localStorage.getItem('raceGamePlayers');
        if (savedPlayers) {
            try {
                this.players = JSON.parse(savedPlayers);
                console.log(`Loaded ${this.players.length} players from session`);
            } catch (e) {
                this.players = [];
            }
        }

        // If no saved players, create defaults
        if (this.players.length === 0) {
            const colors = ["#2C2C2C", "#E0E0E0", "#8B4513", "#A52A2A", "#D2691E", "#F4A460", "#2F4F4F", "#000000", "#FFFFFF", "#808080"];
            for (let i = 1; i <= 10; i++) {
                this.players.push({
                    name: `Ngựa Đua ${i}`,
                    color: colors[i % colors.length],
                    jockeyColor: `hsl(${Math.random() * 360}, 80%, 50%)`
                });
            }
        }
        this.updatePlayerList();

        // === TIME SELECTION BUTTONS ===
        document.querySelectorAll('.btn-time').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Remove active class from all buttons
                document.querySelectorAll('.btn-time').forEach(b => b.classList.remove('active'));
                // Add active class to clicked button
                e.target.classList.add('active');

                // Set race duration
                this.raceDuration = parseInt(e.target.dataset.time);
                // Calculate finish distance: ~200 pixels per second of race time (avg speed ~170)
                this.finishX = this.raceDuration * 200;

                console.log(`Race time set to ${this.raceDuration}s, finishX=${this.finishX}`);

                // Show chaos mode alert for 2 minute race
                if (this.raceDuration >= 60) {
                    alert("🔥 CHẾ ĐỘ CHAOS! Cuộc đua dài 1 phút sẽ có nhiều hỗn loạn hơn!");
                }
            });
        });

        document.getElementById('btnAddPlayer').addEventListener('click', () => {
            const input = document.getElementById('bulkPlayerInput');
            const text = input ? input.value : "";

            if (!text.trim()) return;

            const lines = text.split(/\n/);
            const colors = ["#8B4513", "#A52A2A", "#D2691E", "#F4A460", "#2F4F4F", "#000000", "#FFFFFF", "#808080"];

            let addedCount = 0;
            lines.forEach(line => {
                const name = line.trim();
                // Allow up to 70 players
                if (name && this.players.length < 70) {
                    this.players.push({
                        name: name.substring(0, 30),
                        color: colors[Math.floor(Math.random() * colors.length)],
                        jockeyColor: `hsl(${Math.random() * 360}, 80%, 50%)`
                    });
                    addedCount++;
                }
            });

            if (addedCount > 0) {
                this.updatePlayerList();
                this.savePlayers(); // Save to localStorage
                input.value = '';
            } else {
                alert("Đã đủ 70 người hoặc không có tên hợp lệ!");
            }
        });

        // Start
        const startBtn = document.getElementById('btnStartRace');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                if (this.players.length < 2) {
                    alert("Cần ít nhất 2 người để đua!");
                    return;
                }
                this.startRace();
            });
        }
    }

    updatePlayerList() {
        const list = document.getElementById('playerList');
        if (!list) return;
        list.innerHTML = '';
        this.players.forEach((p, index) => {
            const li = document.createElement('li');
            li.className = 'player-item';
            li.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="display:inline-block; width:20px; height:20px; background:${escapeHtml(p.color)}; border-radius:50%; border:2px solid #333;"></span>
                    <span style="font-weight:bold;">🏇 ${escapeHtml(p.name)}</span>
                </div>
                <button class="btn-delete-player" data-index="${index}" style="background:#ff4757; color:white; border:none; border-radius:5px; padding:5px 10px; cursor:pointer; font-weight:bold;">✕</button>
            `;
            list.appendChild(li);
        });

        // Add delete event listeners
        list.querySelectorAll('.btn-delete-player').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                this.players.splice(index, 1);
                this.updatePlayerList();
                this.savePlayers(); // Save to localStorage
            });
        });
    }

    startRace() {
        console.log("Starting Standard Race...");
        this.state = 'RACING';

        // Initialize race timer
        this.raceStartTime = Date.now();
        this.elapsedTime = 0;

        const lobby = document.getElementById('lobbyScreen');
        if (lobby) lobby.classList.add('hidden');

        // Hide Chaos UI elements if they exist
        const hud = document.getElementById('hudScreen');
        if (hud) hud.classList.remove('hidden');
        const inv = document.querySelector('.inventory-box');
        if (inv) inv.style.display = 'none'; // Hide inventory

        this.renderer.initRace(this.players);
        this.audio.play('start');
    }

    update(dt) {
        if (this.state === 'RACING') {
            this.renderer.update(dt);

            // Check for Finish - use dynamic finishX
            const finishX = this.finishX || 3000;

            // === TRACK RACE POSITIONS FOR RANDOM SURGE ===
            const sortedRunners = [...this.renderer.runners].sort((a, b) => b.x - a.x);
            sortedRunners.forEach((horse, index) => {
                horse.racePosition = index; // 0 = first, 1 = second, etc.
            });

            const leader = sortedRunners[0];

            // === FINAL SHOWDOWN: Last 500m (~3s) = STICK BATTLE! ===
            const distanceToFinish = finishX - leader.x;
            if (distanceToFinish < 500 && distanceToFinish > 0) {
                this.triggerFinalShowdown(dt);
            }

            // COLLISIONS
            this.checkCollisions(dt);

            // UI Update - TOP 5 LEADERBOARD
            for (let i = 0; i < 5; i++) {
                const lbRow = document.getElementById(`lb${i + 1}`);
                if (lbRow && sortedRunners[i]) {
                    const nameSpan = lbRow.querySelector('.lb-name');
                    if (nameSpan) {
                        nameSpan.textContent = escapeHtml(sortedRunners[i].name);
                    }
                }
            }

            // Update Timer Display
            this.elapsedTime = (Date.now() - this.raceStartTime) / 1000; // Convert to seconds
            const minutes = Math.floor(this.elapsedTime / 60);
            const seconds = Math.floor(this.elapsedTime % 60);
            const timerEl = document.getElementById('timerDisplay');
            if (timerEl) {
                timerEl.innerText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }

            // Check if ALL finished or just leader?
            if (leader.x >= finishX && this.state !== 'FINISHED') {
                this.endRace(leader);
            }
        }
    }

    // === FINAL SHOWDOWN MECHANIC - STICK ALWAYS HITS TARGET ===
    triggerFinalShowdown(dt) {
        const runners = this.renderer.runners;
        const sortedByPosition = [...runners].sort((a, b) => b.x - a.x);

        // Each horse has a chance to attack
        for (let i = 0; i < runners.length; i++) {
            const attacker = runners[i];
            if (attacker.stunTimer > 0 || attacker.isAttacking) continue;

            // 20% chance per second to attack
            if (Math.random() < 0.2 * dt) {
                // Find a nearby target to hit (not self, not stunned)
                const targets = runners.filter(r =>
                    r !== attacker &&
                    r.stunTimer <= 0 &&
                    Math.abs(r.x - attacker.x) < 200  // Within stick range
                );

                if (targets.length > 0) {
                    // Pick a target (prefer leader)
                    const target = targets.find(t => t === sortedByPosition[0] || t === sortedByPosition[1]) || targets[0];

                    // ATTACK!
                    attacker.isAttacking = true;
                    attacker.attackTimer = 0.5;
                    attacker.attackType = 'stick';

                    // TARGET FALLS!
                    target.stunTimer = 1.5;
                    target.isFalling = true;
                    target.fallRotation = 0;
                    target.slideVelocity = target.speed * 0.3;
                    target.speed = 0;

                    console.log(`🏏 ${attacker.name} đánh gậy vào ${target.name}!`);

                    // Create dust particles
                    for (let p = 0; p < 10; p++) {
                        target.particles.push({
                            x: target.x,
                            y: target.y + target.laneHeight / 2,
                            vx: (Math.random() - 0.5) * 150,
                            vy: -Math.random() * 100,
                            size: 3 + Math.random() * 4,
                            life: 0.4 + Math.random() * 0.3
                        });
                    }
                }
            }
        }
    }

    checkCollisions(dt) {
        const runners = this.renderer.runners;

        // === IDENTIFY TOP 2 LEADERS FOR TARGETING ===
        const sortedByPosition = [...runners].sort((a, b) => b.x - a.x);
        const leader1 = sortedByPosition[0];
        const leader2 = sortedByPosition[1];

        // Check adjacent pairs
        for (let i = 0; i < runners.length - 1; i++) {
            const h1 = runners[i];
            const h2 = runners[i + 1];

            // Skip if either is already stunned
            if (h1.stunTimer > 0 || h2.stunTimer > 0) continue;

            const dx = Math.abs(h1.x - h2.x);
            // If they are very close horizontally
            if (dx < 60) {
                // Base collision chance
                let collisionChance = 0.08 * (1 - dx / 60);

                // === TOP 2 LEADERS GET TARGETED MORE (3x chance) ===
                const victim = h1.x > h2.x ? h1 : h2; // Horse in front
                if (victim === leader1 || victim === leader2) {
                    collisionChance *= 3; // Leaders are prime targets!
                }

                if (Math.random() < collisionChance) {
                    // === NEW LOGIC: Horse BEHIND knocks horse IN FRONT ===
                    let attacker, victim;
                    if (h1.x < h2.x) {
                        // h1 is behind h2
                        attacker = h1;
                        victim = h2;
                    } else {
                        // h2 is behind h1
                        attacker = h2;
                        victim = h1;
                    }

                    // Only bump if attacker is catching up (moving faster)
                    if (attacker.speed > victim.speed && attacker.speed > 100) {
                        console.log(`💥 BUMP! ${attacker.name} húc ngã ${victim.name}!`);

                        // === ATTACKER PLAYS KICK/HEADBUTT ANIMATION ===
                        attacker.isAttacking = true;
                        attacker.attackTimer = 0.4; // Animation lasts 0.4 seconds
                        attacker.attackType = Math.random() < 0.5 ? 'kick' : 'headbutt';

                        // Victim falls
                        victim.stunTimer = 2.0; // Longer stun for drama
                        victim.isFalling = true;
                        victim.fallRotation = 0;
                        victim.slideVelocity = victim.speed * 0.5; // Slide from momentum
                        victim.speed = 0;

                        // Create dust particles at collision point
                        for (let p = 0; p < 15; p++) {
                            victim.particles.push({
                                x: victim.x,
                                y: victim.y + victim.laneHeight / 2,
                                vx: (Math.random() - 0.5) * 200,
                                vy: -Math.random() * 150,
                                size: 3 + Math.random() * 5,
                                life: 0.5 + Math.random() * 0.5
                            });
                        }

                        // Attacker slows down slightly
                        attacker.speed *= 0.85;
                        this.audio.play('bump');
                    }
                }
            }
        }
    }

    endRace(winner) {
        this.state = 'FINISHED';
        this.audio.play('win');

        // Calculate winner's finish time
        const winnerFinishTime = this.elapsedTime;

        // Sort results by X position (descending) to get order
        const results = [...this.renderer.runners].sort((a, b) => b.x - a.x);

        // Victory Screen
        const vicScreen = document.getElementById('victoryScreen');
        vicScreen.classList.remove('hidden');
        document.getElementById('hudScreen').classList.add('hidden');

        // Populate Winner
        const winnerNameEl = vicScreen.querySelector('.winner-name');
        if (winnerNameEl) winnerNameEl.textContent = winner.name; // textContent is safe

        // Add Vehicle Type text safely
        const vehicleDiv = vicScreen.querySelector('.winner-vehicle');
        if (vehicleDiv) vehicleDiv.innerText = `Thắng bằng: ${winner.type === 'EXCITER' ? '🏍️ EXCITER' : '🐴 NGỰA CHIẾN'}`;

        // Helper function to format time as MM:SS.ms
        const formatTime = (seconds) => {
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            const ms = Math.floor((seconds % 1) * 100);
            return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
        };

        // Populate Table with finish times
        const table = document.getElementById('resultsTable');
        if (table) {
            table.innerHTML = `
                <thead>
                    <tr>
                        <th style="width: 50px;">#</th>
                        <th>Tên Cao Bồi</th>
                        <th>Thời gian về đích</th>
                    </tr>
                </thead>
                <tbody>
                    ${results.map((r, i) => {
                // Calculate finish time based on position gap
                // Approximation: horses behind finish proportionally later
                const distanceGap = winner.x - r.x;
                const timeGap = (distanceGap / winner.x) * winnerFinishTime;
                const finishTime = i === 0 ? winnerFinishTime : winnerFinishTime + timeGap;

                return `
                            <tr>
                                <td>${i + 1}</td>
                                <td>${escapeHtml(r.name)}</td>
                                <td>${i === 0 ? '🏆 ' + formatTime(finishTime) : formatTime(finishTime)}</td>
                            </tr>
                        `;
            }).join('')}
                </tbody>
            `;
        }

        const btnRestart = document.getElementById('btnRestart');
        btnRestart.onclick = () => this.restartRace();
        const btnLobby = document.getElementById('btnLobby');
        btnLobby.onclick = () => this.backToLobby();
    }

    // Save players to localStorage
    savePlayers() {
        localStorage.setItem('raceGamePlayers', JSON.stringify(this.players));
    }

    // Restart race with same players
    restartRace() {
        this.state = 'RACING';
        this.raceStartTime = Date.now();
        this.elapsedTime = 0;

        // Hide victory, show HUD
        document.getElementById('victoryScreen').classList.add('hidden');
        document.getElementById('hudScreen').classList.remove('hidden');

        // Re-init race with existing players
        this.renderer.initRace(this.players);
        this.audio.play('start');
    }

    // Back to lobby
    backToLobby() {
        this.state = 'LOBBY';

        // Hide victory, show lobby
        document.getElementById('victoryScreen').classList.add('hidden');
        document.getElementById('hudScreen').classList.add('hidden');
        document.getElementById('lobbyScreen').classList.remove('hidden');

        // Refresh player list
        this.updatePlayerList();
    }

    render() {
        this.renderer.draw();
    }

    loop(timestamp) {
        if (!this.lastTime) this.lastTime = timestamp;
        const dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;

        this.update(dt);
        this.render();

        requestAnimationFrame(this.loop);
    }
}

// Start
window.addEventListener('load', () => {
    window.game = new Game();
    console.log("STANDARD RACE LOADED");
});
