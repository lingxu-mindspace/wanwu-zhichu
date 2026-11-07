// Tiandao Event Stream + Immutable Log Validation
import { createHash } from "crypto";
const sha256=(s:string)=>createHash("sha256").update(s,"utf-8").digest("hex");

const REGIONS=["zhongyuan","jiangnan","xibei","dongbei","nanman","xizang","mobei"];
function genEvent(i:number){const types=["player_move","player_trade","player_build","combat_event","godhood_check","npc_interaction","resource_gather"];const w=[0.40,0.20,0.10,0.10,0.05,0.10,0.05];let t=0,type=types[0];const r=Math.random();for(let j=0;j<w.length;j++){t+=w[j];if(r<t){type=types[j];break}}return{id:`evt_${i}`,timestamp:Date.now(),type,region:REGIONS[Math.floor(Math.random()*REGIONS.length)],data:{x:Math.random()*10000,y:Math.random()*10000}}}

class HashChain{entries:any[]=[];write(evt:any):number{const prev=this.entries.length>0?this.entries[this.entries.length-1].hash:"0".repeat(64);const hash=sha256(`${prev}${evt.timestamp}${evt.id}${JSON.stringify(evt.data)}`);this.entries.push({...evt,prevHash:prev,hash});return 0}verify(){const s=Date.now();for(let i=0;i<this.entries.length;i++){const e=this.entries[i];const ph=i===0?"0".repeat(64):this.entries[i-1].hash;if(e.prevHash!==ph)return{valid:false,checked:i,ms:Date.now()-s};if(e.hash!==sha256(`${ph}${e.timestamp}${e.id}${JSON.stringify(e.data)}`))return{valid:false,checked:i,ms:Date.now()-s}}return{valid:true,checked:this.entries.length,ms:Date.now()-s}}}

console.log("=".repeat(60)+"\nTIANDAO + IMMUTABLE LOG VALIDATION\n"+"=".repeat(60));

const scenarios=[{l:"1K/s x3s",eps:1000,dur:3,log:false},{l:"10K/s x3s",eps:10000,dur:3,log:false},{l:"50K/s x3s",eps:50000,dur:3,log:false},{l:"100K/s x3s",eps:100000,dur:3,log:false},{l:"10K/s x10s+log",eps:10000,dur:10,log:true},{l:"200K/s x3s+log",eps:200000,dur:3,log:true}];

async function runAll(){for(const sc of scenarios){const chain=new HashChain();let total=0,godhood=0;const start=Date.now(),endTime=start+sc.dur*1000;const batchSize=sc.eps>50000?1000:100;const interval=(batchSize/sc.eps)*1000;
  while(Date.now()<endTime){const loopStart=Date.now();for(let i=0;i<batchSize;i++){const evt=genEvent(total);if(sc.log)chain.write(evt);if(evt.type==="godhood_check")godhood++;total++}const wait=Math.max(0,interval-(Date.now()-loopStart));if(wait>0)await new Promise(r=>setTimeout(r,wait))}
  const elapsed=(Date.now()-start)/1000;const v=chain.verify();console.log(`${sc.l.padEnd(20)} ${(total/elapsed).toFixed(0).padStart(7)}/s | ${total.toLocaleString().padStart(8)} evts | ${godhood.toString().padStart(6)} checks | log: ${sc.log?v.checked+','+v.ms+'ms':"N/A"}`);}}
runAll().catch(console.error);
