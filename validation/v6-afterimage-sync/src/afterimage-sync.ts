// Multi-player Afterimage Sync Validation
// Server-authoritative timeline, periodic client sync, drift measurement

interface Client{id:string;latencyMs:number;jitterMs:number;currentTime:number;drift:number;syncEvents:{t:number;correction:number}[]}

class AfterimageServer{timeline:{id:string;durationMs:number;fps:number;frames:{t:number;data:any}[]};clients:Map<string,Client>=new Map();
  constructor(id:string,dur:number,fps=30){this.timeline={id,durationMs:dur,fps,frames:[]};for(let t=0;t<=dur;t+=1000/fps)this.timeline.frames.push({t,data:{scene:Math.floor(t/1000)}})}}

function simClient(server:AfterimageServer,client:Client,syncMs:number,totalDur:number){
  let lastSync=0,totalErr=0,samples=0,maxErr=0,corrections=0;
  const driftPpm=(Math.random()-0.5)*30+client.latencyMs*0.05;const driftPerTick=driftPpm/1e6;
  for(let t=0;t<totalDur;t+=16){client.currentTime+=16*(1+driftPerTick);if(client.currentTime>server.timeline.durationMs)client.currentTime=server.timeline.durationMs;
    if(t-lastSync>=syncMs){const err=client.currentTime-t;client.drift=err;totalErr+=Math.abs(err);samples++;maxErr=Math.max(maxErr,Math.abs(err));client.syncEvents.push({t,correction:err});corrections++;client.currentTime-=err*0.8;lastSync=t}}
  return{avgDrift:samples>0?totalErr/samples:0,maxDrift:maxErr,corrections}}

function simViewers(label:string,latencies:number[],syncMs:number,dur:number){
  const server=new AfterimageServer("afterimage_test",dur);const clients:Client[]=[];const results:any[]=[];
  for(let i=0;i<latencies.length;i++){const c:Client={id:`c${i}`,latencyMs:latencies[i],jitterMs:Math.floor(latencies[i]*0.2),currentTime:0,drift:0,syncEvents:[]};clients.push(c);const r=simClient(server,c,syncMs,dur);results.push(r)}
  let maxDiff=0,totalDiff=0,diffSamples=0;
  for(let t=0;t<dur;t+=200){const pos=clients.map(c=>{const ev=c.syncEvents.filter(e=>e.t<=t);return ev.length>0?t+ev[ev.length-1].correction*0.2:t});for(let i=0;i<pos.length;i++)for(let j=i+1;j<pos.length;j++){const d=Math.abs(pos[i]-pos[j]);maxDiff=Math.max(maxDiff,d);totalDiff+=d;diffSamples++}}
  const avgDrifts=results.map((r:any)=>r.avgDrift);const maxDrifts=results.map((r:any)=>r.maxDrift);
  console.log(`${label}: avgDrift=${(avgDrifts.reduce((a:number,b:number)=>a+b,0)/avgDrifts.length).toFixed(2)}ms maxDrift=${Math.max(...maxDrifts).toFixed(2)}ms maxClientDiff=${maxDiff.toFixed(2)}ms`);
}

console.log("=".repeat(60)+"\nAFTERIMAGE SYNC VALIDATION\n"+"=".repeat(60));
simViewers("LAN 5p (1s sync)",[5,8,10,12,15],1000,10000);
simViewers("Mixed 8p (1s sync)",[5,15,30,50,80,120,150,200],1000,15000);
simViewers("Fast sync 4p (500ms)",[150,200,250,300],500,10000);
simViewers("50 viewers (2s sync)",Array.from({length:50},()=>10+Math.random()*90),2000,10000);
console.log("\nDone.");
