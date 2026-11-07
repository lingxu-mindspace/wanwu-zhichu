// WebSocket Server — Hit Location Physics Validation
import { WebSocketServer, WebSocket } from "ws";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";
import { createBodyParts, processAttack, BodyPart, BodyPartDef, HitResult } from "./physics";

const MIME: Record<string,string> = {".html":"text/html",".js":"application/javascript",".css":"text/css",".json":"application/json"};
const COLORS = ["#e74c3c","#3498db","#2ecc71","#f39c12","#9b59b6"];

interface Player { ws: WebSocket; id: string; x: number; y: number; facing: number; bodyParts: BodyPartDef[]; armor: {coveredParts:BodyPart[];damageReduction:number;durability:number}[]; isAttacking: boolean; color: string }
const players = new Map<WebSocket, Player>();
let attackCounter = 0;
let config = { simulatedLatency: 0, latencyJitter: 0, packetLossRate: 0, physicsSubsteps: 8 };

const metrics = { totalAttacks:0, hits:0, misses:0, bodyPartHits:{} as Record<string,number>, serverTimes:[] as number[] };
const PART_IDS: BodyPart[] = ["head","torso","left_upper_arm","left_forearm","right_upper_arm","right_forearm","left_upper_leg","left_lower_leg","right_upper_leg","right_lower_leg"];
PART_IDS.forEach(bp=>{metrics.bodyPartHits[bp]=0});

function serveStatic(req: IncomingMessage, res: ServerResponse): boolean {
  const url = req.url || "/";
  let fp: string;
  if(url==="/"||url==="/index.html") fp = join(__dirname,"..","client","index.html");
  else fp = join(__dirname,"..","client",url);
  if(!existsSync(fp)){res.writeHead(404);res.end("Not Found");return true}
  const ext = extname(fp);
  res.writeHead(200,{"Content-Type":MIME[ext]||"text/plain"});
  res.end(readFileSync(fp,"utf-8"));
  return true;
}

export function startServer(port=3001, testConfig?:any) {
  if(testConfig) config = {...config,...testConfig};
  const http = createServer((req,res)=>{if(!serveStatic(req,res)){res.writeHead(404);res.end("Not Found")}});
  const wss = new WebSocketServer({server:http});
  http.listen(port,()=>console.log(`[Server] HTTP+WS on http://localhost:${port} | latency=${config.simulatedLatency}ms`));

  wss.on("connection",(ws:WebSocket)=>{
    ws.on("message",(raw:Buffer)=>{
      try {
        const msg = JSON.parse(raw.toString());
        if(msg.type==="connect"){
          const color = COLORS[players.size % COLORS.length];
          players.set(ws,{ws,id:msg.playerId,x:Math.random()*200-100,y:0,facing:0,bodyParts:createBodyParts(0,0,0),armor:[],isAttacking:false,color});
          ws.send(JSON.stringify({type:"connected",playerId:msg.playerId,assignedColor:color}));
          broadcastState();
        } else if(msg.type==="move"){
          const p = players.get(ws); if(!p) return;
          p.x=msg.x; p.y=msg.y; p.bodyParts=createBodyParts(p.x,p.y,p.facing);
          broadcastState();
        } else if(msg.type==="attack"){
          const attacker = players.get(ws); if(!attacker) return;
          const t0=Date.now(); metrics.totalAttacks++;
          const allHits: HitResult[] = [];
          players.forEach((defender)=>{
            if(defender.id===attacker.id) return;
            const hits = processAttack(attacker.id,{frameStart:msg.data.frameStart,frameEnd:msg.data.frameEnd},msg.data.weapon.thickness,msg.data.weapon.baseDamage,defender.bodyParts,defender.armor,config.physicsSubsteps);
            hits.forEach(h=>{allHits.push(h);metrics.bodyPartHits[h.bodyPart]++});
          });
          if(allHits.length>0) metrics.hits++; else metrics.misses++;
          metrics.serverTimes.push(Date.now()-t0);
          const resp = {attackId:`atk_${++attackCounter}`,hits:allHits,serverTimestamp:Date.now(),measuredLatency:Date.now()-t0};
          const delay = config.simulatedLatency+(Math.random()*2-1)*config.latencyJitter;
          setTimeout(()=>{if(ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type:"hit_result",result:resp}))},Math.max(0,delay));
          broadcastState();
        } else if(msg.type==="equip_armor"){
          const p = players.get(ws); if(!p) return;
          p.armor = p.armor.filter(a=>!a.coveredParts.some(cp=>msg.armor.coveredParts.includes(cp)));
          p.armor.push(msg.armor);
          broadcastState();
        }
      } catch(e) { console.error("Parse error:",e) }
    });
    ws.on("close",()=>{players.delete(ws);broadcastState()});
  });

  function broadcastState(){
    const state:any[] = [];
    players.forEach(p=>state.push({id:p.id,x:p.x,y:p.y,facing:p.facing,bodyParts:p.bodyParts,armor:p.armor,isAttacking:p.isAttacking,color:p.color}));
    const data = JSON.stringify({type:"state_update",players:state});
    players.forEach(p=>{if(p.ws.readyState===WebSocket.OPEN)p.ws.send(data)});
  }

  return {wss,http};
}

export function getMetrics(){return{...metrics}}
export function resetMetrics(){metrics.totalAttacks=0;metrics.hits=0;metrics.misses=0;Object.keys(metrics.bodyPartHits).forEach(k=>metrics.bodyPartHits[k]=0);metrics.serverTimes=[]}
export function setConfig(c:any){config={...config,...c}}

if(require.main===module){startServer(3001)}
