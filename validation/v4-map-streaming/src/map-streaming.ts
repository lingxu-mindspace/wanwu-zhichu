// Global Map Streaming Validation — chunk-based world, zone crossing, async loading
const CHUNK_SIZE=256,WORLD_X=40,WORLD_Y=40,LOAD_R=2,UNLOAD_R=4;
const ZONES=[{n:"zhongyuan",x0:10,y0:12,x1:20,y1:22},{n:"jiangnan",x0:20,y0:8,x1:30,y1:18},{n:"xibei",x0:0,y0:20,x1:10,y1:32},{n:"dongbei",x0:20,y0:22,x1:35,y1:35},{n:"nanman",x0:15,y0:0,x1:30,y1:8}];
function getZone(cx:number,cy:number):string{for(const z of ZONES)if(cx>=z.x0&&cx<z.x1&&cy>=z.y0&&cy<z.y1)return z.n;return"wilderness"}

class ChunkManager{chunks=new Map<string,any>();loadQ:string[]=[];unloadQ:string[]=[];loads:number[]=[];
  constructor(){for(let cx=0;cx<WORLD_X;cx++)for(let cy=0;cy<WORLD_Y;cy++){const z=getZone(cx,cy);const ds=z==="zhongyuan"?8+Math.random()*4:z==="jiangnan"?6+Math.random()*3:z==="wilderness"?1+Math.random()*2:4+Math.random()*3;this.chunks.set(`${cx},${cy}`,{id:`${cx},${cy}`,x:cx,y:cy,zone:z,dataSizeMB:ds,data:null,loaded:false,loadTimeMs:ds*5+Math.random()*20})}}
  getVisible(px:number,py:number):string[]{const cx=Math.floor(px/CHUNK_SIZE),cy=Math.floor(py/CHUNK_SIZE);const v:string[]=[];for(let dx=-LOAD_R;dx<=LOAD_R;dx++)for(let dy=-LOAD_R;dy<=LOAD_R;dy++){const nx=cx+dx,ny=cy+dy;if(nx>=0&&nx<WORLD_X&&ny>=0&&ny<WORLD_Y)v.push(`${nx},${ny}`)}return v}
  queueLoad(needed:string[]){for(const id of needed){const c=this.chunks.get(id);if(c&&!c.loaded&&!this.loadQ.includes(id))this.loadQ.push(id)}}
  queueUnload(keep:Set<string>){this.chunks.forEach((c,id)=>{if(c.loaded&&!keep.has(id)&&!this.unloadQ.includes(id))this.unloadQ.push(id)})}
  processLoading(max:number):{loaded:number;loadTime:number}{let loaded=0,maxLT=0;const tl=this.loadQ.splice(0,max);for(const id of tl){const c=this.chunks.get(id);if(!c)continue;c.data=Buffer.alloc(Math.floor(c.dataSizeMB*1024*1024));c.loaded=true;loaded++;maxLT=Math.max(maxLT,c.loadTimeMs);this.loads.push(c.loadTimeMs)}return{loaded,loadTime:maxLT}}
  processUnloading():number{let u=0;const tul=this.unloadQ.splice(0,100);for(const id of tul){const c=this.chunks.get(id);if(!c||!c.loaded)continue;c.data=null;c.loaded=false;u++}return u}
  getMem():number{let t=0;this.chunks.forEach(c=>{if(c.loaded&&c.data)t+=c.data.length});return t/(1024*1024)}
}

function simulate(label:string,players:{id:string;x:number;y:number;speed:number;path:{x:number;y:number}[],pi:number}[],cm:ChunkManager,frames:number,concLimit:number){
  let zt=0;const prevZ=new Map<string,string>();const fts:number[]=[];
  for(const p of players){const n=cm.getVisible(p.x,p.y);cm.queueLoad(n);prevZ.set(p.id,getZone(Math.floor(p.x/CHUNK_SIZE),Math.floor(p.y/CHUNK_SIZE)))}
  for(let f=0;f<frames;f++){const fs=Date.now();const needed=new Set<string>();
    for(const p of players){if(p.pi<p.path.length){const t=p.path[p.pi];const dx=t.x-p.x,dy=t.y-p.y;const d=Math.sqrt(dx*dx+dy*dy);if(d<p.speed){p.x=t.x;p.y=t.y;p.pi++}else{p.x+=(dx/d)*p.speed;p.y+=(dy/d)*p.speed}
      const cz=getZone(Math.floor(p.x/CHUNK_SIZE),Math.floor(p.y/CHUNK_SIZE));if(cz!==prevZ.get(p.id)){zt++;prevZ.set(p.id,cz)}}
      cm.getVisible(p.x,p.y).forEach(id=>needed.add(id))}
    cm.queueLoad([...needed]);cm.queueUnload(needed);const{loadTime}=cm.processLoading(concLimit);cm.processUnloading();
    const ft=16+loadTime*0.3+Math.random()*2;fts.push(ft+(Date.now()-fs))}
  const avg=fts.reduce((a,b)=>a+b,0)/fts.length;const mx=Math.max(...fts);const hf=fts.filter(t=>t>33).length;
  console.log(`${label}: frames=${frames} | avgFt=${avg.toFixed(1)}ms max=${mx.toFixed(1)}ms hitches=${hf} | mem=${cm.getMem().toFixed(0)}MB | zoneTrans=${zt}`);
}

console.log("GLOBAL MAP STREAMING VALIDATION\n");
// Scenario 1: Single walker
{const cm=new ChunkManager();const p={id:"p1",x:12.5*CHUNK_SIZE,y:17*CHUNK_SIZE,speed:4,path:Array.from({length:400},(_,i)=>({x:12.5*CHUNK_SIZE+(25-12.5)*CHUNK_SIZE*(i+1)/400,y:17*CHUNK_SIZE+(13-17)*CHUNK_SIZE*(i+1)/400})),pi:0};simulate("Walk 1p",[p],cm,400,4)}
// Scenario 2: Fast travel
{const cm=new ChunkManager();const p={id:"p1",x:5*CHUNK_SIZE,y:5*CHUNK_SIZE,speed:16,path:Array.from({length:400},(_,i)=>({x:5*CHUNK_SIZE+25*CHUNK_SIZE*(i+1)/400,y:5*CHUNK_SIZE+20*CHUNK_SIZE*(i+1)/400})),pi:0};simulate("Horse 1p",[p],cm,400,6)}
// Scenario 3: 50 players crossing boundary
{const cm=new ChunkManager();const ps=Array.from({length:50},(_,i)=>({id:`p${i}`,x:19.5*CHUNK_SIZE+Math.random()*CHUNK_SIZE,y:17*CHUNK_SIZE+(i-25)*20,speed:4+Math.random()*2,path:Array.from({length:300},(_,j)=>({x:19.5*CHUNK_SIZE+2.5*CHUNK_SIZE*(j+1)/300,y:17*CHUNK_SIZE-4*CHUNK_SIZE*(j+1)/300+(i-25)*20})),pi:0}));simulate("50p boundary",ps,cm,300,8)}
// Scenario 4: 100 players in capital
{const cm=new ChunkManager();const ps=Array.from({length:100},(_,i)=>{const cx=13+Math.random()*6,cy=15+Math.random()*6;return{id:`p${i}`,x:cx*CHUNK_SIZE,y:cy*CHUNK_SIZE,speed:2+Math.random()*3,path:Array.from({length:200},(_,j)=>({x:cx*CHUNK_SIZE+(Math.random()-0.5)*4*CHUNK_SIZE,y:cy*CHUNK_SIZE+(Math.random()-0.5)*4*CHUNK_SIZE})),pi:0}});simulate("100p capital",ps,cm,200,12)}
console.log("\nDone.");
