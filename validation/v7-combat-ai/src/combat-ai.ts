// Dynamic Skill Pool Combat AI Validation
// Utility-function decision engine, multi-boss concurrency, behavior diversity

interface Skill{id:string;name:string;type:"attack"|"defense"|"movement"|"aoe"|"buff"|"debuff"|"heal"|"ultimate";cooldown:number;castTime:number;range:number;damage:number;tags:string[]}
interface Boss{id:string;hp:number;maxHp:number;cooldowns:Map<string,number>;phase:"idle"|"engage"|"phase2"|"phase3"|"enraged";lastSkill:string|null;history:string[];playerDist:number;playerHpPct:number;playerBlock:boolean;playerCast:boolean;allies:number}

function genPool(size:number):Skill[]{const p:Skill[]=[];const pre=["烈焰","寒冰","雷霆","暗影","神圣","狂风","大地","毒液"];const suf=["斩","突刺","冲击","风暴","护盾","领域","诅咒","祝福","之怒","裁决"];const types:Skill["type"][]=["attack","defense","movement","aoe","buff","debuff","heal","ultimate"];
  for(let i=0;i<size;i++)p.push({id:`s${i}`,name:`${pre[i%8]}${suf[i%10]}`,type:types[i%8],cooldown:500+Math.random()*5000,castTime:100+Math.random()*1500,range:100+Math.random()*900,damage:50+Math.random()*950,tags:[types[i%8],i<size*0.3?"basic":"advanced"]});return p}

function evaluate(skill:Skill,boss:Boss):number{let score=0;const cd=boss.cooldowns.get(skill.id)||0;if(cd>0)return-1;if(boss.playerDist>skill.range&&skill.type!=="movement"&&skill.type!=="buff")score-=50;
  switch(boss.phase){case"engage":if(skill.type==="attack")score+=20;if(skill.type==="defense")score+=5;break;case"phase2":if(skill.type==="aoe")score+=25;if(skill.type==="debuff")score+=20;break;case"phase3":if(skill.type==="ultimate")score+=40;if(skill.type==="buff")score+=30;break;case"enraged":if(skill.type==="attack")score+=30;if(skill.type==="ultimate")score+=50;if(skill.damage>500)score+=20;break}
  if(boss.playerCast&&skill.type==="attack")score+=15;if(boss.playerBlock&&skill.type==="debuff")score+=20;if(boss.playerHpPct<30&&skill.damage>300)score+=25;if(boss.hp/boss.maxHp<0.3&&skill.type==="heal")score+=30;if(boss.hp/boss.maxHp<0.2&&skill.type==="defense")score+=25;if(boss.allies>2&&skill.type==="aoe")score+=20;if(boss.allies>0&&skill.type==="buff")score+=15;if(skill.id===boss.lastSkill)score-=10;score+=(Math.random()-0.3)*15;return score}

function selectSkill(pool:Skill[],boss:Boss):{skill:Skill;score:number}{let best=pool[0],bestS=-Infinity;for(const s of pool){const sc=evaluate(s,boss);if(sc>bestS){bestS=sc;best=s}}return{skill:best,score:bestS}}

console.log("=".repeat(60)+"\nDYNAMIC SKILL POOL COMBAT AI VALIDATION\n"+"=".repeat(60));

// Test 1: Decision speed vs pool size
console.log("\n--- Decision Speed vs Pool Size ---");
for(const size of[10,30,50,100,200,500]){const pool=genPool(size);const boss:Boss={id:"b1",hp:10000,maxHp:10000,cooldowns:new Map(),phase:"engage",lastSkill:null,history:[],playerDist:300,playerHpPct:50,playerBlock:false,playerCast:false,allies:1};const times:number[]=[];const used=new Set<string>();
  for(let i=0;i<500;i++){boss.phase=i<150?"engage":i<300?"phase2":i<400?"phase3":"enraged";boss.playerDist=50+Math.random()*600;boss.playerHpPct=Math.random()*100;boss.playerBlock=Math.random()<0.3;boss.playerCast=Math.random()<0.15;boss.allies=Math.floor(Math.random()*5);boss.cooldowns.forEach((cd,id)=>{const r=cd-16;if(r<=0)boss.cooldowns.delete(id);else boss.cooldowns.set(id,r)});
  const s=process.hrtime.bigint();const r=selectSkill(pool,boss);times.push(Number(process.hrtime.bigint()-s)/1e6);boss.cooldowns.set(r.skill.id,r.skill.cooldown);boss.lastSkill=r.skill.id;boss.history.push(r.skill.id);used.add(r.skill.id)}
  const sorted=[...times].sort((a,b)=>a-b);console.log(`${size.toString().padStart(4)} skills: avg=${(times.reduce((a,b)=>a+b,0)/times.length).toFixed(4)}ms p95=${sorted[Math.floor(sorted.length*0.95)].toFixed(4)}ms variety=${(used.size/size*100).toFixed(0)}%`)}

// Test 2: Concurrent bosses
console.log("\n--- Concurrent Bosses (100 skills) ---");
for(const count of[1,5,10,20,50]){const pool=genPool(100);const bosses:Boss[]=Array.from({length:count},(_,i)=>({id:`b${i}`,hp:10000,maxHp:10000,cooldowns:new Map(),phase:"engage" as const,lastSkill:null,history:[],playerDist:300,playerHpPct:50,playerBlock:false,playerCast:false,allies:1}));const times:number[]=[];
  for(let d=0;d<200;d++)for(const b of bosses){const s=process.hrtime.bigint();const r=selectSkill(pool,b);times.push(Number(process.hrtime.bigint()-s)/1e6);b.cooldowns.set(r.skill.id,r.skill.cooldown);b.lastSkill=r.skill.id}
  console.log(`${count.toString().padStart(2)} bosses: avg=${(times.reduce((a,b)=>a+b,0)/times.length).toFixed(4)}ms total=${times.length} decisions`)}

console.log("\nDone.");
