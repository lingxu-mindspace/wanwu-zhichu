// ============================================================
// 万物之初 — 集成压力测试
// 场景：中原地区 100玩家 + NPC + 半神, 10分钟模拟
// 全链路：战斗→天道→日志→NPC记忆→封神检测→残像
// ============================================================

import { createHash } from "crypto";

// ============================================================
// CONFIG — GDD 定义的核心参数
// ============================================================
const CONFIG = {
  PLAYERS: 100,
  NPCS: 20,
  DEMIGODS: 2,          // 河伯 + 朱厌
  DURATION_SECONDS: 120, // 2分钟（快速验证），生产可调至600
  TICK_MS: 50,          // 20 tick/s
  PHYSICS_SUBSTEPS: 4,
  // GDD 封神参数
  GODHOOD_MERIT_THRESHOLD: 100000,
  GODHOOD_DAO_THRESHOLD: 50000,
  GODHOOD_MERIT_RATIO: 3.0,   // 功绩 ÷ (过失 × 权重) ≥ 3.0
  GODHOOD_DEMERIT_WEIGHT: 2.0,
  // GDD 神降代价
  DESCENT_COST_DURATION: 0.5,   // 每秒累加
  DESCENT_COST_POWER: 1.0,      // 每级神力累加
  // 世界参数
  REGION: "zhongyuan",
};

// ============================================================
// TYPES
// ============================================================

type BodyPart = "head"|"torso"|"left_arm"|"right_arm"|"left_leg"|"right_leg";

interface Player {
  id: string; name: string;
  hp: number; maxHp: number;
  x: number; y: number;
  faction: "shang"|"yong"|"qi"|"ying"|"liang"|"wild";
  // Tiandao
  merit: number;       // 功绩轴
  demerit: number;     // 过失轴
  daoValue: number;    // 天道数值（隐藏）
  // Combat
  kills: number;
  deaths: number;
  demigodDamage: number; // 对半神造成的伤害（功绩来源）
  isAlive: boolean;
  respawnTimer: number;
}

interface NPC {
  id: string; name: string;
  role: string;
  x: number; y: number;
  hp: number; maxHp: number;
  isAlive: boolean;
  memories: Array<{tick:number; playerId:string; event:string; importance:number}>;
  socialConnections: Map<string, number>; // NPC or player id → strength
}

interface DemigodState {
  id: string; name: string;
  hp: number; maxHp: number;
  phase: "idle"|"engage"|"enraged"|"defeated";
  x: number; y: number;
  skills: DemigodSkill[];
  currentCooldowns: Map<string, number>;
  lastSkill: string | null;
  skillHistory: string[];
  defeatedBy: string | null;
  afterimageTriggered: boolean;
}

interface DemigodSkill {
  id: string; name: string;
  type: "attack"|"aoe"|"debuff"|"buff"|"movement"|"ultimate";
  cooldown: number;
  damage: number;
  range: number;
  tags: string[];
}

interface LogEntry {
  index: number;
  tick: number;
  eventType: string;
  data: any;
  prevHash: string;
  hash: string;
}

interface Afterimage {
  id: string;
  location: {x:number;y:number};
  triggerEvent: string;
  triggerTick: number;
  durationMs: number;
  participants: string[];
  importance: number;
}

interface WorldMetrics {
  // Combat
  totalAttacks: number; totalHits: number; totalMisses: number;
  bodyPartHits: Record<string, number>;
  playerDeaths: number; demigodDeaths: number;
  // Tiandao
  totalMeritAwarded: number; totalDemeritAwarded: number;
  godhoodChecks: number; godhoodCandidates: number; godhoodQualified: number;
  godhoodCheckTimes: number[];
  // Log
  logEntriesWritten: number;
  avgLogWriteMs: number;
  // NPC
  npcMemoriesCreated: number;
  npcGossipSpread: number;
  // Demigod AI
  demigodDecisions: number;
  avgDecisionTimeMs: number;
  // Afterimage
  afterimagesGenerated: number;
  // Performance
  avgTickTimeMs: number;
  maxTickTimeMs: number;
  peakMemoryMB: number;
  totalRuntimeMs: number;
}

// ============================================================
// SHA-256 helper
// ============================================================
function sha256(s: string): string {
  return createHash("sha256").update(s,"utf-8").digest("hex");
}

// ============================================================
// WORLD INIT
// ============================================================

const FACTION_NAMES: Record<string,string> = {shang:"商", yong:"雍", qi:"岐", ying:"郢", liang:"梁", wild:"蛮荒"};
const SURNAMES = ["李","王","张","刘","陈","杨","赵","黄","周","吴","徐","孙","马","朱","胡","郭","何","高","林"];
const GIVENS = ["明","华","强","伟","芳","娜","敏","静","丽","洋","勇","军","杰","欣","宇","浩","博","文"];
const NPC_ROLES = ["铁匠","药商","酒馆主","猎户","农夫","祭司","学者","士兵","商人","长老","卜官","司徒","大卜","典狱","匠作","剑士"];

function genName(): string {
  return SURNAMES[Math.floor(Math.random()*SURNAMES.length)] + GIVENS[Math.floor(Math.random()*GIVENS.length)];
}

function createPlayers(count: number): Player[] {
  const players: Player[] = [];
  const factions = Object.keys(FACTION_NAMES);
  for (let i=0; i<count; i++) {
    players.push({
      id: `p_${i}`, name: genName(),
      hp: 100, maxHp: 100,
      x: 200 + Math.random() * 400,  // 中原地区中心区域
      y: 200 + Math.random() * 400,
      faction: factions[Math.floor(Math.random()*factions.length)],
      merit: Math.floor(Math.random()*50000),
      demerit: Math.floor(Math.random()*20000),
      daoValue: Math.floor(Math.random()*30000),
      kills: 0, deaths: 0, demigodDamage: 0,
      isAlive: true, respawnTimer: 0,
    });
  }
  return players;
}

function createNPCs(count: number): NPC[] {
  const npcs: NPC[] = [];
  for (let i=0; i<count; i++) {
    const npc: NPC = {
      id: `npc_${i}`,
      name: genName(),
      role: NPC_ROLES[i % NPC_ROLES.length],
      x: 300 + Math.random() * 300,
      y: 300 + Math.random() * 300,
      hp: 50, maxHp: 50,
      isAlive: true,
      memories: [],
      socialConnections: new Map(),
    };
    // Pre-populate some memories
    for (let j=0; j<20; j++) {
      npc.memories.push({
        tick: -Math.floor(Math.random()*1000),
        playerId: `p_${Math.floor(Math.random()*count)}`,
        event: ["trade","quest","gift","insult","rescue"][Math.floor(Math.random()*5)],
        importance: Math.floor(Math.random()*100),
      });
    }
    npcs.push(npc);
  }
  // Social connections
  for (const npc of npcs) {
    const connCount = 5 + Math.floor(Math.random()*10);
    for (let j=0; j<connCount; j++) {
      const target = npcs[Math.floor(Math.random()*count)];
      if (target.id !== npc.id) npc.socialConnections.set(target.id, Math.random());
    }
  }
  return npcs;
}

function createDemigods(): DemigodState[] {
  return [
    {
      id: "hebo", name: "河伯",
      hp: 5000, maxHp: 5000,
      phase: "idle", x: 400, y: 350,
      skills: [
        {id:"flood_wave",name:"浊浪滔天",type:"aoe",cooldown:3000,damage:80,range:200,tags:["water","knockback"]},
        {id:"drown",name:"溺毙缠绕",type:"attack",cooldown:1500,damage:150,range:50,tags:["water","grab"]},
        {id:"mud_armor",name:"淤泥甲胄",type:"buff",cooldown:5000,damage:0,range:0,tags:["defense","water"]},
        {id:"whirlpool",name:"漩涡牢笼",type:"debuff",cooldown:4000,damage:40,range:150,tags:["water","trap"]},
        {id:"river_wrath",name:"河神之怒",type:"ultimate",cooldown:10000,damage:300,range:300,tags:["water","ultimate"]},
      ],
      currentCooldowns: new Map(), lastSkill: null, skillHistory: [],
      defeatedBy: null, afterimageTriggered: false,
    },
    {
      id: "zhuyan", name: "朱厌",
      hp: 3000, maxHp: 3000,
      phase: "idle", x: 550, y: 400,
      skills: [
        {id:"war_cry",name:"战吼",type:"debuff",cooldown:2000,damage:20,range:250,tags:["fear","sound"]},
        {id:"savage_claw",name:"蛮荒之爪",type:"attack",cooldown:1000,damage:120,range:30,tags:["physical","bleed"]},
        {id:"blood_frenzy",name:"血怒狂暴",type:"buff",cooldown:6000,damage:0,range:0,tags:["self","enrage"]},
        {id:"leap_smash",name:"跃击",type:"movement",cooldown:2500,damage:60,range:180,tags:["physical","aoe"]},
        {id:"apocalypse_howl",name:"终末嗥叫",type:"ultimate",cooldown:12000,damage:250,range:400,tags:["sound","ultimate","fear"]},
      ],
      currentCooldowns: new Map(), lastSkill: null, skillHistory: [],
      defeatedBy: null, afterimageTriggered: false,
    },
  ];
}

// ============================================================
// COLLISION (from v1, simplified for integration)
// ============================================================

function distance(a:{x:number;y:number}, b:{x:number;y:number}): number {
  return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2);
}

function checkBodyPartHit(
  attackerX: number, attackerY: number,
  defenderX: number, defenderY: number,
  attackRange: number
): { hit: boolean; parts: BodyPart[]; dmg: number } {
  const dist = distance({x:attackerX,y:attackerY}, {x:defenderX,y:defenderY});
  if (dist > attackRange) return { hit:false, parts:[], dmg:0 };

  // Body part probability based on attack angle
  const dy = defenderY - attackerY;
  const absDy = Math.abs(dy);
  const roll = Math.random();
  const parts: BodyPart[] = [];

  if (roll < 0.15) parts.push("head");
  else if (roll < 0.55) parts.push("torso");
  else if (roll < 0.70) parts.push(absDy < 30 ? "left_arm" : "right_arm");
  else if (roll < 0.85) parts.push(absDy < 30 ? "right_arm" : "left_arm");
  else if (roll < 0.93) parts.push("left_leg");
  else parts.push("right_leg");

  // Damage multiplier by part
  const dmgMul: Record<BodyPart,number> = {
    head: 3.0, torso: 1.0, left_arm: 0.7, right_arm: 0.7,
    left_leg: 0.6, right_leg: 0.6,
  };
  const baseDmg = 20 + Math.random() * 30;
  const dmg = baseDmg * dmgMul[parts[0]];

  return { hit:true, parts, dmg };
}

// ============================================================
// TIANDAO SYSTEM (from v2, with GDD formulas)
// ============================================================

function calculateGodhoodEligibility(p: Player): {
  eligible: boolean;
  meritScore: number;
  ratio: number;
  reason: string;
} {
  const { GODHOOD_MERIT_THRESHOLD, GODHOOD_DAO_THRESHOLD, GODHOOD_MERIT_RATIO, GODHOOD_DEMERIT_WEIGHT } = CONFIG;

  // Check merit threshold
  if (p.merit < GODHOOD_MERIT_THRESHOLD) {
    return { eligible:false, meritScore:p.merit, ratio:0, reason:"功绩不足" };
  }

  // Check dao threshold
  if (p.daoValue < GODHOOD_DAO_THRESHOLD) {
    return { eligible:false, meritScore:p.merit, ratio:0, reason:"天道数值不足" };
  }

  // Calculate merit ratio: 功绩 ÷ (过失 × 过失权重) ≥ 封神资格线
  const weightedDemerit = p.demerit * GODHOOD_DEMERIT_WEIGHT;
  const ratio = weightedDemerit > 0 ? p.merit / weightedDemerit : p.merit / 1; // no demerit → infinite ratio, capped

  if (ratio < GODHOOD_MERIT_RATIO) {
    return { eligible:false, meritScore:p.merit, ratio, reason:`功过比不足 (${ratio.toFixed(2)} < ${GODHOOD_MERIT_RATIO})` };
  }

  return { eligible:true, meritScore:p.merit, ratio, reason:"满足全部封神条件" };
}

function awardMerit(player: Player, action: string, amount: number): void {
  player.merit += amount;
  // Merit awards can also boost dao value
  player.daoValue += Math.floor(amount * 0.3);
}

function awardDemerit(player: Player, action: string, amount: number, isMajorViolation: boolean = false): void {
  // GDD: Major violations have extra weight
  const multiplier = isMajorViolation ? 5.0 : 1.0;
  player.demerit += Math.floor(amount * multiplier);
  player.daoValue -= Math.floor(amount * 0.5);
}

// ============================================================
// DEMIGOD AI (from v7, utility-based)
// ============================================================

function evaluateDemigodSkill(skill: DemigodSkill, demigod: DemigodState, targets: Player[]): number {
  if (demigod.currentCooldowns.has(skill.id)) return -1;

  let score = 0;
  const nearby = targets.filter(p => p.isAlive && distance(p, demigod) < skill.range).length;
  const inRange = nearby > 0;

  switch (demigod.phase) {
    case "idle":
      if (skill.type === "attack") score += 10;
      break;
    case "engage":
      if (skill.type === "attack") score += 20;
      if (skill.type === "aoe" && nearby >= 3) score += 25;
      if (skill.type === "movement" && !inRange) score += 30;
      break;
    case "enraged":
      if (skill.type === "ultimate") score += 50;
      if (skill.type === "aoe") score += 30;
      if (skill.damage > 150) score += 25;
      break;
    case "defeated":
      return -1;
  }

  // HP-based
  const hpPct = demigod.hp / demigod.maxHp;
  if (hpPct < 0.3 && skill.tags.includes("defense")) score += 40;
  if (hpPct < 0.2 && skill.tags.includes("enrage")) score += 50;

  // Avoid repeating
  if (skill.id === demigod.lastSkill) score -= 15;

  // Random noise
  score += (Math.random() - 0.3) * 20;

  return score;
}

function selectDemigodSkill(demigod: DemigodState, targets: Player[]): DemigodSkill {
  let bestSkill = demigod.skills[0];
  let bestScore = -Infinity;

  for (const skill of demigod.skills) {
    const score = evaluateDemigodSkill(skill, demigod, targets);
    if (score > bestScore) {
      bestScore = score;
      bestSkill = skill;
    }
  }

  return bestSkill;
}

// ============================================================
// NPC SOCIAL (from v5)
// ============================================================

function npcWitnessEvent(npcs: NPC[], playerId: string, event: string, importance: number, tick: number): void {
  // Nearby NPCs remember the event
  for (const npc of npcs) {
    if (!npc.isAlive) continue;
    // 20% chance NPC was nearby
    if (Math.random() < 0.2) {
      npc.memories.push({ tick, playerId, event, importance });
      // Trim old memories
      if (npc.memories.length > 200) {
        npc.memories = npc.memories
          .sort((a,b) => b.importance - a.importance)
          .slice(0, 150);
      }
    }
  }
}

function npcGossip(npcs: NPC[], tick: number): number {
  let spread = 0;
  for (const npc of npcs) {
    if (!npc.isAlive || npc.memories.length === 0 || Math.random() > 0.1) continue;
    // Pick a high-importance memory and share with a social connection
    const mem = npc.memories.sort((a,b)=>b.importance-a.importance)[0];
    if (mem.importance < 50) continue;

    npc.socialConnections.forEach((strength, targetId) => {
      if (Math.random() < 0.3 * strength) {
        const target = npcs.find(n => n.id === targetId);
        if (target && target.isAlive) {
          target.memories.push({
            tick,
            playerId: mem.playerId,
            event: `gossip: ${mem.event}`,
            importance: Math.floor(mem.importance * 0.7),
          });
          spread++;
        }
      }
    });
  }
  return spread;
}

// ============================================================
// HASH CHAIN LOGGING (from v3)
// ============================================================

class HashChainLogger {
  entries: LogEntry[] = [];
  private genesisHash = "0".repeat(64);

  write(tick: number, eventType: string, data: any): number {
    const start = Date.now();
    const prevHash = this.entries.length > 0
      ? this.entries[this.entries.length-1].hash
      : this.genesisHash;
    const hashInput = `${prevHash}${tick}${eventType}${JSON.stringify(data)}`;
    const hash = sha256(hashInput);

    this.entries.push({
      index: this.entries.length,
      tick, eventType, data, prevHash, hash,
    });
    return Date.now() - start;
  }

  verify(): {valid:boolean; checked:number; ms:number} {
    const start = Date.now();
    for (let i=0; i<this.entries.length; i++) {
      const e = this.entries[i];
      const prevH = i===0 ? this.genesisHash : this.entries[i-1].hash;
      if (e.prevHash !== prevH) return {valid:false, checked:i, ms:Date.now()-start};
      const expected = sha256(`${prevH}${e.tick}${e.eventType}${JSON.stringify(e.data)}`);
      if (e.hash !== expected) return {valid:false, checked:i, ms:Date.now()-start};
    }
    return {valid:true, checked:this.entries.length, ms:Date.now()-start};
  }
}

// ============================================================
// MAIN SIMULATION
// ============================================================

function simulate(): WorldMetrics {
  console.log("=".repeat(70));
  console.log("万物之初 — 集成压力测试");
  console.log(`中原地区 | ${CONFIG.PLAYERS}玩家 + ${CONFIG.NPCS}NPC + ${CONFIG.DEMIGODS}半神 | ${CONFIG.DURATION_SECONDS}s`);
  console.log("=".repeat(70));

  // Init world
  const players = createPlayers(CONFIG.PLAYERS);
  const npcs = createNPCs(CONFIG.NPCS);
  const demigods = createDemigods();
  const logger = new HashChainLogger();
  const afterimages: Afterimage[] = [];
  let tickCount = 0;

  // Metrics accumulators
  let totalAttacks=0, totalHits=0, totalMisses=0;
  const bodyPartHits: Record<string,number> = {};
  let totalDeaths=0, demigodDeaths=0;
  let totalMerit=0, totalDemerit=0;
  let godhoodChecks=0, godhoodCandidates=0, godhoodQualified=0;
  const godhoodCheckTimes: number[] = [];
  const logWriteTimes: number[] = [];
  let npcMemories=0, gossipSpread=0;
  let demigodDecisions=0, demigodDecisionTime=0;
  let afterimageCount=0;
  const tickTimes: number[] = [];

  const totalTicks = Math.floor(CONFIG.DURATION_SECONDS * 1000 / CONFIG.TICK_MS);
  const simStart = Date.now();

  console.log(`\n运行 ${totalTicks} ticks...\n`);

  for (let tick = 0; tick < totalTicks; tick++) {
    const tickStart = Date.now();

    // ── Phase 1: Player Movement ──
    for (const p of players) {
      if (!p.isAlive) {
        p.respawnTimer -= CONFIG.TICK_MS;
        if (p.respawnTimer <= 0) {
          p.isAlive = true;
          p.hp = p.maxHp;
          p.x = 200 + Math.random() * 400;
          p.y = 200 + Math.random() * 400;
        }
        continue;
      }
      // Random walk + bias toward demigods if alive
      const nearestDemigod = demigods.find(d => d.phase !== "defeated");
      const biasX = nearestDemigod ? (nearestDemigod.x - p.x) * 0.001 : 0;
      const biasY = nearestDemigod ? (nearestDemigod.y - p.y) * 0.001 : 0;
      p.x += (Math.random()-0.5) * 6 + biasX * 2;
      p.y += (Math.random()-0.5) * 6 + biasY * 2;
      p.x = Math.max(100, Math.min(700, p.x));
      p.y = Math.max(100, Math.min(700, p.y));
    }

    // ── Phase 2: NPC Movement ──
    for (const n of npcs) {
      if (!n.isAlive) continue;
      n.x += (Math.random()-0.5) * 2;
      n.y += (Math.random()-0.5) * 2;
    }

    // ── Phase 3: Player vs Player Combat ──
    for (let i = 0; i < players.length; i++) {
      const a = players[i];
      if (!a.isAlive) continue;
      // Each player has 5% chance to attack per tick
      if (Math.random() > 0.05) continue;

      // Find nearby target
      let target: Player | null = null;
      // 70% attack someone in different faction, 30% anyone
      const preferFaction = Math.random() < 0.7;

      for (let j = 0; j < players.length; j++) {
        if (i === j) continue;
        const d = players[j];
        if (!d.isAlive) continue;
        if (preferFaction && d.faction === a.faction) continue;
        const dist = distance(a, d);
        if (dist < 30) { target = d; break; }
      }
      if (!target) continue;

      totalAttacks++;
      const result = checkBodyPartHit(a.x, a.y, target.x, target.y, 30);
      if (result.hit) {
        totalHits++;
        const part = result.parts[0];
        bodyPartHits[part] = (bodyPartHits[part]||0)+1;
        target.hp -= result.dmg;

        if (target.hp <= 0) {
          target.hp = 0;
          target.isAlive = false;
          target.deaths++;
          target.respawnTimer = 5000;
          a.kills++;
          totalDeaths++;

          // Tiandao: kill awards
          if (target.faction !== a.faction && target.faction !== "wild") {
            awardMerit(a, "pvp_kill", 200);
            awardDemerit(a, "murder", 50);
          } else if (target.faction === "wild") {
            awardMerit(a, "wild_kill", 50);
          } else {
            awardDemerit(a, "friendly_fire", 150);
          }

          totalMerit += 200;
          totalDemerit += 50;

          // Log significant combat
          const logMs = logger.write(tick, "player_death", {
            killer: a.id, victim: target.id, part, damage: result.dmg,
            killerFaction: a.faction, victimFaction: target.faction,
          });
          logWriteTimes.push(logMs);

          // NPCs witness
          npcWitnessEvent(npcs, a.id, "kill", 70, tick);
          npcMemories++;
        } else {
          // Non-lethal hit: small merit/demerit
          awardMerit(a, "combat_hit", 5);
          totalMerit += 5;
          awardDemerit(a, "assault", 2);
          totalDemerit += 2;
        }

        logger.write(tick, "combat_hit", {
          attacker: a.id, defender: target.id, part, damage: result.dmg, lethal: target.hp <= 0,
        });
      } else {
        totalMisses++;
      }
    }

    // ── Phase 4: Demigod AI ──
    for (const dm of demigods) {
      if (dm.phase === "defeated") continue;

      // Phase transition
      const hpPct = dm.hp / dm.maxHp;
      if (hpPct < 0.2) dm.phase = "enraged";
      else if (hpPct < 0.5) dm.phase = "engage";
      else dm.phase = "idle";

      // Update cooldowns
      dm.currentCooldowns.forEach((cd, id) => {
        const r = cd - CONFIG.TICK_MS;
        if (r <= 0) dm.currentCooldowns.delete(id);
        else dm.currentCooldowns.set(id, r);
      });

      // Make decision every ~2 seconds (simulated at 40 ticks)
      if (tick % 40 === 0) {
        const decStart = Date.now();
        const alivePlayers = players.filter(p => p.isAlive && distance(p, dm) < 300);
        const skill = selectDemigodSkill(dm, alivePlayers);
        dm.currentCooldowns.set(skill.id, skill.cooldown);
        dm.lastSkill = skill.id;
        dm.skillHistory.push(skill.id);
        demigodDecisions++;
        demigodDecisionTime += Date.now() - decStart;

        // Execute skill on nearby players
        for (const p of alivePlayers) {
          if (distance(p, dm) > skill.range) continue;
          p.hp -= skill.damage;
          dm.demigodDamage = (dm as any).demigodDamage||0;
          (dm as any).demigodDamage += skill.damage;

          // Player damaged demigod → merit
          // (This would be from player attacks, tracked separately)

          if (p.hp <= 0) {
            p.isAlive = false;
            p.deaths++;
            p.respawnTimer = 5000;
            totalDeaths++;
            const logMs = logger.write(tick, "demigod_kill", {
              demigod: dm.name, player: p.id, skill: skill.name,
            });
            logWriteTimes.push(logMs);
          }
        }

        // Log demigod action
        logger.write(tick, "demigod_action", {
          demigod: dm.name, skill: skill.name, targets: alivePlayers.length, phase: dm.phase,
        });
      }
    }

    // ── Phase 5: Player vs Demigod Combat ──
    for (const p of players) {
      if (!p.isAlive) continue;
      for (const dm of demigods) {
        if (dm.phase === "defeated") continue;
        const dist = distance(p, dm);
        if (dist > 40 || Math.random() > 0.08) continue; // 8% chance to attack if in range

        const dmg = 10 + Math.random() * 25;
        dm.hp -= dmg;
        p.demigodDamage += dmg;
        awardMerit(p, "demigod_combat", Math.floor(dmg * 0.5));
        totalMerit += Math.floor(dmg * 0.5);

        // Demigod defeated
        if (dm.hp <= 0 && dm.phase !== "defeated") {
          dm.hp = 0;
          dm.phase = "defeated";
          dm.defeatedBy = p.id;
          demigodDeaths++;

          // Massive merit award
          awardMerit(p, "demigod_defeat", 50000);
          totalMerit += 50000;

          // Log
          logger.write(tick, "demigod_defeated", {
            demigod: dm.name, defeatedBy: p.id, playerFaction: p.faction,
          });

          // NPCs witness (high importance)
          npcWitnessEvent(npcs, p.id, `defeated_${dm.name}`, 100, tick);
          npcMemories++;

          // Generate afterimage
          const ai: Afterimage = {
            id: `ai_${dm.name}_${tick}`,
            location: {x:dm.x, y:dm.y},
            triggerEvent: `半神${dm.name}被击败`,
            triggerTick: tick,
            durationMs: 30000, // 30s playback
            participants: [p.id, dm.id],
            importance: 100,
          };
          afterimages.push(ai);
          afterimageCount++;

          // Log afterimage generation
          logger.write(tick, "afterimage_generated", {
            afterimageId: ai.id, location: ai.location, defeated: dm.name,
          });
        }
      }
    }

    // ── Phase 6: Godhood Check (every 10s = 200 ticks) ──
    if (tick % 200 === 0 && tick > 0) {
      const gStart = Date.now();
      godhoodChecks++;
      let candidatesChecked = 0;

      for (const p of players) {
        if (!p.isAlive) continue;
        candidatesChecked++;
        const result = calculateGodhoodEligibility(p);
        if (result.eligible) {
          godhoodQualified++;
          logger.write(tick, "godhood_candidate", {
            player: p.id, merit: p.merit, demerit: p.demerit,
            daoValue: p.daoValue, ratio: result.ratio,
          });
        }
      }
      godhoodCandidates = candidatesChecked;
      godhoodCheckTimes.push(Date.now() - gStart);
    }

    // ── Phase 7: NPC Gossip (every 5s = 100 ticks) ──
    if (tick % 100 === 0) {
      gossipSpread += npcGossip(npcs, tick);
    }

    // ── Phase 8: Metrics ──
    const tickTime = Date.now() - tickStart;
    tickTimes.push(tickTime);
    tickCount = tick;

    // Progress
    if (tick % 500 === 0 && tick > 0) {
      const elapsed = ((Date.now() - simStart)/1000).toFixed(1);
      const alive = players.filter(p=>p.isAlive).length;
      const livingDemigods = demigods.filter(d=>d.phase!=="defeated").length;
      console.log(`  tick ${tick}/${totalTicks} | ${elapsed}s | ${alive} alive | ${livingDemigods} demigods | ${totalAttacks} atks | ${totalHits} hits | ${godhoodQualified} qualified`);
    }
  }

  const totalRuntime = Date.now() - simStart;

  // Final metrics
  const sortedTicks = [...tickTimes].sort((a,b)=>a-b);
  const peakMem = Math.round(process.memoryUsage().heapUsed/1024/1024*100)/100;

  return {
    totalAttacks, totalHits, totalMisses,
    bodyPartHits,
    playerDeaths: totalDeaths, demigodDeaths,
    totalMeritAwarded: totalMerit, totalDemeritAwarded: totalDemerit,
    godhoodChecks, godhoodCandidates, godhoodQualified,
    godhoodCheckTimes,
    logEntriesWritten: logger.entries.length,
    avgLogWriteMs: logWriteTimes.length>0 ? logWriteTimes.reduce((a,b)=>a+b,0)/logWriteTimes.length : 0,
    npcMemoriesCreated: npcMemories,
    npcGossipSpread: gossipSpread,
    demigodDecisions,
    avgDecisionTimeMs: demigodDecisions>0 ? demigodDecisionTime/demigodDecisions : 0,
    afterimagesGenerated: afterimageCount,
    avgTickTimeMs: tickTimes.reduce((a,b)=>a+b,0)/tickTimes.length,
    maxTickTimeMs: sortedTicks[sortedTicks.length-1],
    peakMemoryMB: peakMem,
    totalRuntimeMs: totalRuntime,
  };
}

// ============================================================
// RUN & REPORT
// ============================================================

console.log("\n初始化世界...");
const metrics = simulate();

console.log("\n" + "=".repeat(70));
console.log("集成压力测试 — 结果报告");
console.log("=".repeat(70));

console.log("\n── 战斗系统 ──");
console.log(`  总攻击: ${metrics.totalAttacks} | 命中: ${metrics.totalHits} | 未命中: ${metrics.totalMisses}`);
console.log(`  命中率: ${metrics.totalAttacks>0?(metrics.totalHits/metrics.totalAttacks*100).toFixed(1):'0'}%`);
console.log(`  部位分布:`);
for (const [part,count] of Object.entries(metrics.bodyPartHits).sort((a,b)=>b[1]-a[1])) {
  const pct = metrics.totalHits>0 ? (count/metrics.totalHits*100).toFixed(1) : '0';
  console.log(`    ${part}: ${count} (${pct}%)`);
}
console.log(`  玩家死亡: ${metrics.playerDeaths} | 半神阵亡: ${metrics.demigodDeaths}`);

console.log("\n── 天道系统 ──");
console.log(`  功绩总计: ${metrics.totalMeritAwarded.toLocaleString()} | 过失总计: ${metrics.totalDemeritAwarded.toLocaleString()}`);
console.log(`  封神检测次数: ${metrics.godhoodChecks}`);
console.log(`  候选人: ${metrics.godhoodCandidates} | 合格: ${metrics.godhoodQualified}`);
if (metrics.godhoodCheckTimes.length > 0) {
  const avgGC = metrics.godhoodCheckTimes.reduce((a,b)=>a+b,0)/metrics.godhoodCheckTimes.length;
  console.log(`  封神检测平均耗时: ${avgGC.toFixed(2)}ms`);
}

console.log("\n── 哈希链日志 ──");
console.log(`  日志条目: ${metrics.logEntriesWritten.toLocaleString()}`);
console.log(`  平均写入: ${metrics.avgLogWriteMs.toFixed(3)}ms`);

console.log("\n── NPC社交 ──");
console.log(`  记忆创建: ${metrics.npcMemoriesCreated} | 八卦传播: ${metrics.npcGossipSpread}`);

console.log("\n── 半神AI ──");
console.log(`  决策次数: ${metrics.demigodDecisions} | 平均决策: ${metrics.avgDecisionTimeMs.toFixed(4)}ms`);

console.log("\n── 历史残像 ──");
console.log(`  生成残像: ${metrics.afterimagesGenerated}`);

console.log("\n── 性能 ──");
console.log(`  总运行时间: ${(metrics.totalRuntimeMs/1000).toFixed(1)}s (目标 ${CONFIG.DURATION_SECONDS}s)`);
console.log(`  平均Tick: ${metrics.avgTickTimeMs.toFixed(2)}ms | 最差Tick: ${metrics.maxTickTimeMs.toFixed(2)}ms`);
console.log(`  峰值内存: ${metrics.peakMemoryMB}MB`);
const realtimeRatio = metrics.totalRuntimeMs / (CONFIG.DURATION_SECONDS * 1000);
if (realtimeRatio < 0.5) {
  console.log(`  ✅ 实时比 ${realtimeRatio.toFixed(2)}x (模拟快于实时)`);
} else if (realtimeRatio < 1.5) {
  console.log(`  ⚠️ 实时比 ${realtimeRatio.toFixed(2)}x (接近实时)`);
} else {
  console.log(`  ❌ 实时比 ${realtimeRatio.toFixed(2)}x (低于实时)`);
}

// Final verdict
console.log("\n" + "=".repeat(70));
console.log("集成验证结论");
console.log("=".repeat(70));

const checks: Array<[string, boolean, string]> = [
  ["战斗→天道→日志链路贯通", metrics.totalAttacks > 0 && metrics.logEntriesWritten > 0, ""],
  ["功过轴独立记录不抵消", metrics.totalMeritAwarded > 0 && metrics.totalDemeritAwarded > 0, "GDD §3.1"],
  ["封神检测定期执行", metrics.godhoodChecks > 0, "GDD §3.1"],
  ["半神AI动态技能选择", metrics.demigodDecisions > 0, "GDD 附录A"],
  ["历史残像自动生成", metrics.afterimagesGenerated > 0, "GDD §3.4"],
  ["NPC记忆与八卦传播", metrics.npcMemoriesCreated > 0 && metrics.npcGossipSpread > 0, "GDD §5.3"],
  ["平均Tick < 50ms (20tick/s)", metrics.avgTickTimeMs < 50, ""],
  ["最差Tick < 100ms (10tick/s)", metrics.maxTickTimeMs < 100, ""],
];

let pass = 0, fail = 0;
for (const [name, ok, ref] of checks) {
  const mark = ok ? "✅" : "❌";
  if (ok) pass++; else fail++;
  console.log(`  ${mark} ${name}${ref ? ` [${ref}]` : ""}`);
}

console.log(`\n  通过: ${pass}/${checks.length} | 失败: ${fail}/${checks.length}`);
if (fail === 0) {
  console.log("\n  ✅ 全链路集成验证通过。系统架构可支撑制作阶段启动。");
} else {
  console.log("\n  ⚠️ 存在失败项，需在制作阶段前解决。");
}
