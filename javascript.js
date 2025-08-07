// Complete `javascript.js` with Procedural Levels,
// Extended Floor, Platform-Bound Enemies, Difficulty Progression,
// Checkpoints, In-Canvas HUD, and Player Death

// -- Constants & Cached Canvas --
const WORLD_WIDTH = 4000;
const WORLD_HEIGHT = 450;
const GRAVITY = 0.5;
const FRICTION = 0.8;
const BASE_SPEED = 3;
const RUN_MULT = 1.8;
const JUMP_POWER = 12;
const BULLET_SPEED = 8;
const ENEMY_SPEED = 1.5;
const MAX_HEALTH = 3;
const INV_TIME = 60;
const DEATH_TIME = 60;

// Procedural generation parameters
const MIN_PLATFORM_WIDTH = 80;
const MAX_PLATFORM_WIDTH = 200;
const FLOOR_GAP_MIN = 20;
const FLOOR_GAP_MAX = 30;
const PLATFORM_Y_RANGE = [200, 350];
const BASE_ENEMY_COUNT = 3;
const DIFFICULTY_INCREMENT = 0.1;
const ENEMY_SPAWN_SAFE_ZONE = 200;
const SHOOTER_MIN_X = 500;

// Utility Functions
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function rectIntersect(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
         a.y < b.y + b.height && a.y + a.height > b.y;
}

// -- LevelGenerator: builds platforms, enemies, flag, checkpoint --
class LevelGenerator {
  constructor(level, game) {
    this.level = level;
    this.game = game;
    this.difficulty = 1 + level * DIFFICULTY_INCREMENT;
    this.platforms = [];
    this.enemies = [];
  }

  generateFloorWithGaps() {
    let x = 0;
    while (x < WORLD_WIDTH) {
      const width = randInt(MIN_PLATFORM_WIDTH * 2, MAX_PLATFORM_WIDTH * 2);
      this.platforms.push(new Platform(x, WORLD_HEIGHT - 20, width, 20));
      const gap = randInt(FLOOR_GAP_MIN, FLOOR_GAP_MAX);
      x += width + gap;
    }
  }

  generateFloatingPlatforms() {
    let x = randInt(300, 600);
    while (x < WORLD_WIDTH - 400) {
      const width = randInt(MIN_PLATFORM_WIDTH, MAX_PLATFORM_WIDTH);
      const y = randInt(...PLATFORM_Y_RANGE);
      this.platforms.push(new Platform(x, y, width, 20));
      x += width + randInt(100, 200);
    }
  }

  generatePlatforms() {
    this.generateFloorWithGaps();
    this.generateFloatingPlatforms();
  }

  generateEnemies() {
    const validPlatforms = this.platforms.filter(p => p.x > ENEMY_SPAWN_SAFE_ZONE);
    const count = Math.floor(BASE_ENEMY_COUNT * this.difficulty);
    for (let i = 0; i < count; i++) {
      const plat = validPlatforms[randInt(0, validPlatforms.length - 1)];
      let enemy;
      if (plat.x > SHOOTER_MIN_X && Math.random() < 0.3 * this.difficulty) {
        enemy = new ShooterEnemy(plat, this);
      } else {
        enemy = new Enemy(plat);
      }
      enemy.platformIndex = this.platforms.indexOf(plat);
      this.enemies.push(enemy);
    }
  }

  placeFlagAndCheckpoint() {
    const lastPlat = this.platforms[this.platforms.length - 1];
    this.flag = new Flag(lastPlat.x + lastPlat.width - 20, lastPlat.y - 50);
    this.checkpoint = new Checkpoint(lastPlat.x + lastPlat.width / 2, lastPlat.y - 70);
  }

  build() {
    this.generatePlatforms();
    this.generateEnemies();
    this.placeFlagAndCheckpoint();
    return {
      platforms: this.platforms,
      enemies: this.enemies,
      flag: this.flag,
      checkpoint: this.checkpoint
    };
  }
}

// -- Entity Base Class --
class Entity {
  constructor(x, y, width, height) {
    Object.assign(this, { x, y, width, height });
  }
  draw(ctx) {
    ctx.fillRect(this.x, this.y, this.width, this.height);
  }
}

// -- Platform --
class Platform extends Entity {}

// -- Bullet (player and enemy) --
class Bullet extends Entity {
  constructor(x, y, dir, game, isEnemy=false) {
    super(x - 5, y - 5, 10, 10);
    this.dir = dir;
    this.game = game;
    this.isEnemy = isEnemy;
  }
  update(cameraX, enemies, player) {
    this.x += this.dir * BULLET_SPEED;
    if (!this.isEnemy) {
      for (const e of enemies) {
        if (e.alive && !e.dying && rectIntersect(this, e)) {
          e.startDying();
          this.game.score += 100;
          return false;
        }
      }
    } else {
      if (rectIntersect(this, player) && player.inv === 0) {
        player.health--;
        player.inv = INV_TIME;
        this.game.score = Math.max(0, this.game.score - 200);
        if (player.health <= 0) return 'reset';
        return false;
      }
    }
    return this.x >= cameraX && this.x <= cameraX + this.game.canvasWidth;
  }
  draw(ctx) {
    ctx.beginPath();
    ctx.arc(this.x + this.width/2, this.y + this.height/2, this.width/2, 0, Math.PI*2);
    ctx.fill();
  }
}

// -- Player --
class Player extends Entity {
  constructor() {
    super(100, 100, 40, 60);
    this.velX=0; this.velY=0;
    this.onGround=false; this.facing=1;
    this.health=MAX_HEALTH; this.inv=0;
  }
  handleInput(keys) {
    const run = keys[16];
    const cap = BASE_SPEED * (run ? RUN_MULT : 1);
    if (keys[39]||keys[68]) { this.velX = Math.min(this.velX+1, cap); this.facing=1; }
    if (keys[37]||keys[65]) { this.velX = Math.max(this.velX-1, -cap); this.facing=-1; }
  }
  update(platforms) {
    if (this.inv>0) this.inv--;
    this.velX*=FRICTION; this.velY+=GRAVITY;
    this.x+=this.velX; this.y+=this.velY; this.onGround=false;
    this.x=Math.max(0,Math.min(this.x,WORLD_WIDTH-this.width));
    if (this.y+this.height>WORLD_HEIGHT) { this.y=WORLD_HEIGHT-this.height; this.velY=0; this.onGround=true; }
    for (const p of platforms) this.resolveCollision(p);
  }
  jump() { if (this.onGround) { this.velY=-JUMP_POWER; this.onGround=false; } }
  resolveCollision(p) {
    if (!rectIntersect(this,p)) return;
    const ox=this.x+this.width/2-(p.x+p.width/2);
    const oy=this.y+this.height/2-(p.y+p.height/2);
    const hw=this.width/2+p.width/2;
    const hh=this.height/2+p.height/2;
    const dx=hw-Math.abs(ox);
    const dy=hh-Math.abs(oy);
    if (dx<dy) { this.x += ox>0?dx:-dx; this.velX=0; }
    else { if (oy>0) { this.y=p.y+p.height; this.velY=0; } else { this.y=p.y-this.height; this.velY=0; this.onGround=true; } }
  }
  draw(ctx) {
    if (this.inv>0 && Math.floor(this.inv/5)%2===0) return;
    super.draw(ctx);
  }
}

// -- Enemy Base --
class Enemy extends Entity {
  constructor(platform) {
    super(platform.x + (platform.width-40)/2, platform.y-60, 40,60);
    this.platformIndex = null;
    this.speed = ENEMY_SPEED;
    this.velX = this.speed;
    this.velY = 0;
    this.alive = true;
    this.dying = false;
    this.deathTimer = 0;
  }
  startDying() { this.dying=true; this.deathTimer=DEATH_TIME; this.velX=0; }
  update(platforms, enemies, player) {
    if (!this.alive) return;
    if (this.dying) { this.deathTimer--; if (this.deathTimer<=0) this.alive=false; return; }
    // gravity & vertical
    this.velY+=GRAVITY; this.y+=this.velY;
    for (const p of platforms) this.resolveCollisions(p);
    // horizontal patrol
    const plat = platforms[this.platformIndex];
    const prevX = this.x;
    this.x += this.velX;
    if (this.x < plat.x || this.x+this.width>plat.x+plat.width) { this.velX*=-1; this.x=prevX; }
    // collide player
    if (rectIntersect(this,player) && player.inv===0) { player.health--; player.inv=INV_TIME; if(player.health<=0) return 'reset'; }
  }
  resolveCollisions(p) {
    if (!rectIntersect(this,p)) return;
    const ox=this.x+this.width/2-(p.x+p.width/2);
    const oy=this.y+this.height/2-(p.y+p.height/2);
    const hw=this.width/2+p.width/2;
    const hh=this.height/2+p.height/2;
    const dx=hw-Math.abs(ox);
    const dy=hh-Math.abs(oy);
    if(dx<dy) { this.x+=ox>0?dx:-dx; this.velX*=-1; }
    else { if(oy>0){ this.y=p.y+p.height; this.velY=0; } else { this.y=p.y-this.height; this.velY=0; } }
  }
  draw(ctx) {
    if (this.dying && Math.floor(this.deathTimer/5)%2===0) return;
    if (!this.alive) return;
    super.draw(ctx);
  }
}

// -- ShooterEnemy --
class ShooterEnemy extends Enemy {
  constructor(platform, generator) {
    super(platform);
    this.generator = generator;
    this.shootCooldown = Math.max(30, Math.floor(120/generator.difficulty));
    this.cooldown = randInt(0,this.shootCooldown);
  }
  update(platforms, enemies, player) {
    const act = super.update(platforms, enemies, player);
    if (this.alive && !this.dying) {
      this.cooldown--;
      if (this.cooldown<=0) { this.shoot(player); this.cooldown=this.shootCooldown; }
    }
    return act;
  }
  shoot(player) {
    const dir = (player.x+player.width/2 < this.x)?-1:1;
    this.generator.game.bullets.push(new Bullet(this.x+20,this.y+30,dir,this.generator.game,true));
  }
}

// -- Checkpoint --
class Checkpoint extends Entity {
  constructor(x,y){ super(x,y,20,40); this.reached=false; }
  update(player,game){ if(!this.reached && rectIntersect(this,player)) { this.reached=true; game.saveAtCheckpoint(); }}
  draw(ctx){ ctx.fillStyle=this.reached?'#f1c40f':'#ecf0f1'; super.draw(ctx); }
}

// -- Flag --
class Flag extends Entity {
  constructor(x,y){ super(x,y,20,50); }
  draw(ctx){ ctx.fillStyle='#ffd700'; super.draw(ctx); }
}

// -- Main Game Class --
class Game {
  static canvas = document.getElementById('game');
  constructor() {
    this.ctx = Game.canvas.getContext('2d');
    this.canvasWidth = Game.canvas.width;
    this.canvasHeight = Game.canvas.height;
    this.cameraX = 0;
    this.CAMERA_LAG = 0.1;

    this.keys = new Array(256).fill(false);
    this.canShoot = true;

    this.platforms = [];
    this.enemies = [];
    this.bullets = [];

    this.player = new Player();
    this.level = 1;
    this.score = 0;
    this.startTime = performance.now();
    this.lastTime = this.startTime;

    this.checkpoint = null;
    this.flag = null;

    this.overlay = document.getElementById('overlay');
    this.overlayText = document.getElementById('overlay-text');

    this.bindButtons();
    this.initInput();
    this.initLevel();
    requestAnimationFrame(this.loop.bind(this));
  }

  bindButtons() {
    document.getElementById('btn-restart').onclick = this.restartLevel.bind(this);
    document.getElementById('btn-next').onclick    = this.nextLevel.bind(this);
    document.getElementById('btn-quit').onclick    = () => location.reload();
  }

  initInput() {
    document.addEventListener('keydown', e => {
      if (!e.repeat) {
        this.keys[e.keyCode] = true;
        if (e.code === 'KeyW' || e.code === 'ArrowUp') this.player.jump();
        if (e.code === 'Space' && this.canShoot) {
          this.bullets.push(new Bullet(
            this.player.x + this.player.width/2,
            this.player.y + this.player.height/2,
            this.player.facing,
            this,
            false
          ));
          this.canShoot = false;
        }
      }
    });
    document.addEventListener('keyup', e => {
      this.keys[e.keyCode] = false;
      if (e.code === 'Space') this.canShoot = true;
    });
  }

  initLevel() {
    const gen = new LevelGenerator(this.level, this);
    const lvl = gen.build();
    this.platforms   = lvl.platforms;
    this.enemies     = lvl.enemies;
    this.flag        = lvl.flag;
    this.checkpoint  = lvl.checkpoint;
  }

  resetLevel() {
    if (this.checkpoint && this.checkpoint.reached) {
      // Respawn at the checkpoint with a fully reset player state.
      this.player.x = this.respawnX;
      this.player.y = this.respawnY;
      this.player.health = MAX_HEALTH;
      this.player.inv = 0;
      this.player.velX = 0;
      this.player.velY = 0;
      this.bullets.length = 0;
    } else {
      this.player = new Player();
      this.bullets.length = 0;
      this.score = Math.max(0, this.score - 200);
      this.startTime = performance.now();
    }
  }

  restartLevel() {
    this.overlay.style.visibility = 'hidden';
    this.player = new Player();
    this.bullets.length = 0;
    this.cameraX = 0;
    this.startTime = performance.now();
    this.lastTime = this.startTime;
    this.checkpoint = null;
    this.initLevel();
  }

  nextLevel() {
    this.level++;
    this.score += Math.floor(this.level * 50);
    this.startTime = performance.now();
    this.lastTime = this.startTime;
    this.initLevel();
  }

  saveAtCheckpoint() {
    this.respawnX = this.player.x;
    this.respawnY = this.player.y;
  }

  update(dt) {
    this.player.handleInput(this.keys);
    this.player.update(this.platforms);

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const res = this.enemies[i].update(this.platforms, this.enemies, this.player);
      if (res === 'reset') { this.resetLevel(); return; }
      if (!this.enemies[i].alive) this.enemies.splice(i, 1);
    }

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const res = this.bullets[i].update(this.cameraX, this.enemies, this.player);
      if (res === 'reset') { this.resetLevel(); return; }
      if (!res) this.bullets.splice(i, 1);
    }

    if (this.checkpoint) this.checkpoint.update(this.player, this);
    if (this.keys[69] && rectIntersect(this.player, this.flag)) {
      this.showOverlay();
    }

    // camera follow
    const targetX = this.player.x - this.canvasWidth/2 + this.player.width/2;
    this.cameraX += (targetX - this.cameraX) * this.CAMERA_LAG;
    this.cameraX = Math.max(0, Math.min(this.cameraX, WORLD_WIDTH - this.canvasWidth));
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

    ctx.save();
    ctx.translate(-this.cameraX, 0);
    ctx.fillStyle = '#2ecc71'; this.platforms.forEach(p => p.draw(ctx));
    this.flag.draw(ctx);
    ctx.fillStyle = '#e74c3c'; this.player.draw(ctx);
    ctx.fillStyle = '#34495e'; this.enemies.forEach(e => e.draw(ctx));
    ctx.fillStyle = '#8e44ad'; this.bullets.forEach(b => b.draw(ctx));
    if (this.checkpoint) this.checkpoint.draw(ctx);
    ctx.restore();

    // health
    for (let i = 0; i < MAX_HEALTH; i++) {
      ctx.fillStyle = i < this.player.health ? '#e74c3c' : '#aaa';
      ctx.fillRect(10 + i*20, 10, 15, 15);
    }

    // in-canvas HUD
    const elapsed = Math.floor((performance.now() - this.startTime)/1000);
    ctx.font = '18px Arial'; ctx.fillStyle = '#000';
    ctx.fillText(`Score: ${this.score}`, 10, 40);
    ctx.fillText(`Time: ${elapsed}s`, 10, 60);
  }

  showOverlay() {
    this.overlayText.textContent = `Level ${this.level} Complete!`;
    this.overlay.style.visibility = 'visible';
  }

  loop(now) {
    const dt = (now - this.lastTime)/1000;
    this.lastTime = now;
    this.update(dt);
    this.draw();
    requestAnimationFrame(this.loop.bind(this));
  }
}

// start the game
new Game();
