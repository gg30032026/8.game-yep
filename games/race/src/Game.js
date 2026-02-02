import { Renderer } from './Renderer.js';
import { AudioManager } from './AudioManager.js';
import { Item } from './Entities.js';

export class Game {
    constructor() {
        this.state = 'LOBBY'; // LOBBY, RACING, FINISHED
        this.container = document.getElementById('game-container');
        this.renderer = new Renderer(this);
        this.audio = new AudioManager();

        this.players = [];
        this.raceDuration = 30; // seconds
        this.lastTime = 0;
        this.finishX = 3000;

        // Chaos System
        this.items = [];
        this.spawnTimer = 0;
        this.spawnInterval = 2; // spawn every 2 seconds (decreases in chaos mode)

        // Settings
        this.isChaosMode = false;

        this.initLobbyEvents();
        this.loop = this.loop.bind(this);
        requestAnimationFrame(this.loop);
    }

    spawnItem() {
        if (!this.renderer.runners.length) return;

        // Find leading runner X
        const leaderX = this.renderer.runners.reduce((max, r) => Math.max(max, r.x), 0);

        // Spawn ahead of leader
        const spawnX = leaderX + 800 + Math.random() * 400;
        const laneIdx = Math.floor(Math.random() * 8); // Random lane 0-7
        const laneH = this.renderer.laneHeight || 100; // Fallback
        const spawnY = this.renderer.startY + (laneIdx * laneH) + (laneH / 2);

        // Create Item
        const item = new Item(spawnX, spawnY);
        this.items.push(item);
    }

    aiUseItem(runner) {
        if (runner.inventory.length > 0) {
            const item = runner.inventory.pop();
            this.handleCombat(item.specificType, runner);
        }
    }

    handleCombat(type, source) {
        console.log(`Combat: ${source.name} uses ${type}`);

        // Find Target (Simple logic: Ahead if behind, Random if leading)
        let target = null;
        const potentialTargets = this.renderer.runners.filter(r => r !== source && r.status === 'RUNNING');
        if (potentialTargets.length === 0) return;

        // Random target for now
        target = potentialTargets[Math.floor(Math.random() * potentialTargets.length)];

        if (type === 'ROCK') {
            this.applyDamage(target, 10, 'ROCK');
        } else if (type === 'GUN') {
            this.applyDamage(target, 20, 'GUN');
        } else if (type === 'BOMB') {
            this.applyDamage(target, 30, 'BOMB');
        } else if (type === 'BOOST') {
            source.speed += 300; // Temp boost
        }
    }

    applyDamage(target, amount, type) {
        console.log(`HIT: ${target.name} took ${amount} dmg from ${type}`);

        target.hp -= amount;
        target.status = 'STUNNED';
        target.stunTimer = 1.0; // 1s stun

        // Check for Exciter Transformation
        if (target.hp <= 0 && target.type === 'HORSE') {
            console.log(`${target.name} CALLING EXCITER!`);
            target.type = 'EXCITER';
            target.hp = 100; // Reset HP for bike
            target.status = 'RUNNING';
            target.maxSpeed = 350; // Faster
        }
    }

    initLobbyEvents() {
        // --- Players ---
        this.players = [
            { name: "Ngọc", color: "#FF6B6B" },
            { name: "Minh", color: "#4ECDC4" },
            { name: "Hùng", color: "#FFD93D" }
        ];
        this.updatePlayerList();

        document.getElementById('btnAddPlayer').addEventListener('click', () => {
            const input = document.getElementById('newPlayerName');
            const name = input.value.trim();
            if (name && this.players.length < 8) {
                this.players.push({
                    name,
                    color: `hsl(${Math.random() * 360}, 70%, 50%)`
                });
                this.updatePlayerList();
                input.value = '';
            }
        });

        // --- Time Settings ---
        document.querySelectorAll('.btn-time').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.btn-time').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.raceDuration = parseInt(e.target.dataset.time);
                this.isChaosMode = (this.raceDuration >= 120);
                alert(this.isChaosMode ? "CẢNH BÁO: CHẾ ĐỘ HỖN LOẠN! (Nhiều Vật Phẩm, Nhiều Exciter)" : "Đã đặt thời gian.");
            });
        });

        // --- Start ---
        document.getElementById('btnStartRace').addEventListener('click', () => {
            this.startRace();
        });

        // --- Restart / Navigation ---
        const bindReload = (id) => {
            const btn = document.getElementById(id);
            if (btn) btn.addEventListener('click', () => location.reload());
        };
        bindReload('btnRestart');
        bindReload('btnLobby');
    }

    updatePlayerList() {
        const list = document.getElementById('playerList');
        list.innerHTML = '';
        this.players.forEach((p, index) => {
            const li = document.createElement('li');
            li.className = 'player-item';
            li.innerHTML = `
                <span>🤠 ${p.name}</span>
                <span style="color:${p.color}">🐴</span>
            `;
            list.appendChild(li);
        });
    }

    startRace() {
        this.state = 'RACING';
        document.getElementById('lobbyScreen').classList.add('hidden');
        document.getElementById('hudScreen').classList.remove('hidden');

        // Initialize Entities
        this.renderer.initRace(this.players, this.finishX);
        this.audio.play('start');
    }

    update(dt) {
        if (this.state === 'RACING') {
            this.renderer.update(dt);

            // Spawn Items
            this.spawnTimer += dt;
            if (this.spawnTimer > this.spawnInterval) {
                this.spawnItem();
                this.spawnTimer = 0;
            }

            // Update Items
            this.items.forEach(i => i.update(dt));

            // Collision Detection (Runner <-> Item)
            this.renderer.runners.forEach(r => {
                this.items.forEach(item => {
                    if (!item.collected && Math.abs(r.x - item.x) < 40 && Math.abs((r.y + r.laneHeight / 2) - item.y) < 20) {
                        item.collected = true;
                        if (r.inventory.length < 1) {
                            r.inventory.push(item);
                            console.log(r.name, "picked up", item.specificType);
                            // Auto use for AI (simplified for chaos)
                            if (Math.random() < 0.7) this.aiUseItem(r);
                        }
                    }
                });
            });

            // Initial race timer logic
            // Check for Finish
            const finishX = this.finishX; // Match Renderer
            const leader = this.renderer.runners.reduce((max, r) => r.x > max.x ? r : max, this.renderer.runners[0]);

            // UI Update Top Bar
            document.getElementById('leaderName').innerText = leader.name;
            const time = (this.lastTime / 1000).toFixed(2); // Simple timer

            if (leader.x >= finishX) {
                this.endRace(leader);
            }
        }
    }

    endRace(winner) {
        this.state = 'FINISHED';
        this.audio.play('win'); // Play Gangnam Style ideally

        console.log("WINNER:", winner.name);

        // Show Victory Screen
        const vicScreen = document.getElementById('victoryScreen');
        vicScreen.classList.remove('hidden');
        document.getElementById('hudScreen').classList.add('hidden');

        // Update Victory Content
        vicScreen.querySelector('.victory-title').innerText = "🎉 " + (winner.type === 'EXCITER' ? "CHIẾN THẦN TỐC ĐỘ!" : "VUA TỐC ĐỘ!") + " 🎉";
        vicScreen.querySelector('.winner-name').innerText = winner.name;
        vicScreen.querySelector('.winner-avatar').innerText = winner.emoji; // 😎 or 🏍️
        vicScreen.querySelector('.winner-vehicle').innerText = `Thắng bằng: ${winner.type === 'EXCITER' ? '🏍️ EXCITER' : '🐴 NGỰA CHIẾN'}`;


        // Restart Event - Simplified
        // Listeners are now bound in initLobbyEvents to prevent issues
    }

    render() {

        this.renderer.draw();
    }

    loop(timestamp) {
        const dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;

        this.update(dt);
        this.render();

        requestAnimationFrame(this.loop);
    }
}
