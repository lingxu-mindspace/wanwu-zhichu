// NPC Social Simulation + Memory Query Validation
const NPC_C=Number(process.env.NPC_COUNT)||1000, PLAYER_C=10000, MEM_PER=500, MAX_MEM=1000, DECAY_DAYS=30;

interface Mem{id:string;playerId:string;eventType:string;importance:number;timestamp:number;details:string;decayed:boolean}
interface NPC{id:string;name:string;location:string;memories:Mem[];social:Map<string,number>}

function genNPCs(count:number,memCount:number):NPC[]{const npcs:NPC[]=[];const names=["铁匠","药师","村长","猎人","商人","学者","士兵","农夫","酒馆主","祭司"];
  for(let i=0;i<count;i++){const npc:NPC={id:`npc_${i}`,name:names[i%10]+(i>10?String(Math.floor(i/10)):""),location:`village_${Math.floor(Math.random()*100)}`,memories:[],social:new Map()};npcs.push(npc)}
  for(const npc of npcs){const mc=memCount+Math.floor(Math.random()*100-50);for(let j=0;j<mc;j++)npc.memories.push({id:`mem_${npc.id}_${j}`,playerId:`player_${Math.floor(Math.random()*PLAYER_C)}`,eventType:["trade","combat","quest","gift","theft","rescue","betrayal","teaching"][Math.floor(Math.random()*8)],importance:Math.floor(Math.random()*100)+1,timestamp:Date.now()-Math.floor(Math.random()*DECAY_DAYS*2*24*3600*1000),details:`Interaction ${j}`,decayed:false});npc.memories.sort((a,b)=>b.importance-a.importance);if(npc.memories.length>MAX_MEM)npc.memories=npc.memories.slice(0,MAX_MEM)}
  for(const npc of npcs){const cc=30+Math.floor(Math.random()*40);for(let j=0;j<cc;j++){const t=npcs[Math.floor(Math.random()*count)];if(t.id!==npc.id)npc.social.set(t.id,Math.random())}}
  return npcs}

function benchQuery(npcs:NPC[],queries:number){const times:number[]=[];for(let i=0;i<queries;i++){const npc=npcs[Math.floor(Math.random()*npcs.length)];const pid=`player_${Math.floor(Math.random()*PLAYER_C)}`;const th=Math.random()*50;const s=process.hrtime.bigint();npc.memories.filter(m=>m.playerId===pid&&m.importance>=th&&!m.decayed);times.push(Number(process.hrtime.bigint()-s)/1e6)}const sorted=[...times].sort((a,b)=>a-b);return{avg:times.reduce((a,b)=>a+b,0)/times.length,p95:sorted[Math.floor(sorted.length*0.95)],p99:sorted[Math.floor(sorted.length*0.99)]}}

function applyDecay(npcs:NPC[]){let d=0;const cutoff=Date.now()-DECAY_DAYS*24*3600*1000;for(const n of npcs)for(const m of n.memories)if(!m.decayed&&m.timestamp<cutoff&&m.importance<50){m.decayed=true;d++}let r=0;for(const n of npcs)r+=n.memories.filter(m=>!m.decayed).length;return{decayed:d,remaining:r}}

console.log("=".repeat(60)+"\nNPC SOCIAL SIMULATION VALIDATION\n"+"=".repeat(60));
console.log(`Generating ${NPC_C} NPCs with ~${MEM_PER} memories each...`);
const ts=Date.now();const npcs=genNPCs(NPC_C,MEM_PER);const gt=Date.now()-ts;
const totalMem=npcs.reduce((s,n)=>s+n.memories.length,0);
const totalConn=npcs.reduce((s,n)=>s+n.social.size,0);
console.log(`Generated in ${gt}ms | ${totalMem.toLocaleString()} memories | ${totalConn.toLocaleString()} connections`);

console.log("\n--- Memory Query (10K queries) ---");
const q=benchQuery(npcs,10000);
console.log(`avg=${q.avg.toFixed(4)}ms p95=${q.p95.toFixed(4)}ms p99=${q.p99.toFixed(4)}ms`);

console.log("\n--- Memory Decay ---");
const d=applyDecay(npcs);
console.log(`Decayed: ${d.decayed.toLocaleString()} | Remaining: ${d.remaining.toLocaleString()} | Rate: ${(d.decayed/totalMem*100).toFixed(1)}%`);

console.log("\n--- Player-Specific Search (full scan) ---");
{const tp="player_42";const s=process.hrtime.bigint();let f=0;for(const n of npcs)f+=n.memories.filter(m=>m.playerId===tp&&!m.decayed).length;console.log(`Player ${tp}: ${f} memories found in ${(Number(process.hrtime.bigint()-s)/1e6).toFixed(2)}ms`)}

console.log("\nDone.");
