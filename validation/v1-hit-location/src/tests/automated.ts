// Automated Test — Hit Location Physics. 5 latency conditions, 50 attacks each.
import WebSocket from "ws";
import { startServer, getMetrics, resetMetrics, setConfig } from "../server/index";
function sleep(ms:number){return new Promise(r=>setTimeout(r,ms))}
async function createClient(port:number,id:string):Promise<{ws:WebSocket;pending:Array<{sendTime:number;resolve:(r:any)=>void}>}>{
  return new Promise((resolve,reject)=>{const ws=new WebSocket(`ws://localhost:${port}`);const pending:Array<{sendTime:number;resolve:(r:any)=>void}>=[];
    const t=setTimeout(()=>reject(new Error("timeout")),5000);ws.on("open",()=>{ws.send(JSON.stringify({type:"connect",playerId:id}));
      function onFirst(raw:Buffer){const m=JSON.parse(raw.toString());if(m.type==="connected"){clearTimeout(t);ws.removeListener("message",onFirst);
        ws.on("message",(raw2:Buffer)=>{const m2=JSON.parse(raw2.toString());if(m2.type==="hit_result"){const p=pending.shift();if(p)p.resolve({rtt:Date.now()-p.sendTime,hits:m2.result.hits.length})}});
        resolve({ws,pending});}}ws.on("message",onFirst);});ws.on("error",e=>{clearTimeout(t);reject(e)});});}
async function main(){const PORT=3007;const{wss,http}=startServer(PORT);await sleep(300);
  const tests=[{l:"0ms",c:{simulatedLatency:0,latencyJitter:0,packetLossRate:0}},{l:"10ms",c:{simulatedLatency:10,latencyJitter:2,packetLossRate:0}},{l:"50ms",c:{simulatedLatency:50,latencyJitter:10,packetLossRate:0}},{l:"150ms",c:{simulatedLatency:150,latencyJitter:30,packetLossRate:0}},{l:"300ms",c:{simulatedLatency:300,latencyJitter:50,packetLossRate:0}}];
  console.log("HIT LOCATION PHYSICS VALIDATION\n");
  for(const t of tests){resetMetrics();setConfig(t.c);const atk=await createClient(PORT,"atk");const def=await createClient(PORT,"def");atk.ws.send(JSON.stringify({type:"move",x:200,y:250}));def.ws.send(JSON.stringify({type:"move",x:230,y:250}));await sleep(300);
    const rtts:number[]=[];let hits=0;for(let i=0;i<50;i++){const hx=215,hy=270,tx=230+(Math.random()-0.5)*15,ty=250+[48,28,35,-12][i%4]+(Math.random()-0.5)*5;const dx=tx-hx,dy=ty-hy,d=Math.sqrt(dx*dx+dy*dy);const p=new Promise<any>(r=>atk.pending.push({sendTime:Date.now(),resolve:r}));atk.ws.send(JSON.stringify({type:"attack",data:{attackerId:"atk",weapon:{id:"sword",blade:{start:{x:hx,y:hy},end:{x:hx+(dx/d)*40,y:hy+(dy/d)*40}},thickness:3,baseDamage:30},frameStart:{start:{x:hx,y:hy},end:{x:hx+12,y:hy-4}},frameEnd:{start:{x:hx,y:hy},end:{x:hx+(dx/d)*40,y:hy+(dy/d)*40}},clientTimestamp:Date.now(),frameNumber:i}}));
      try{const info=await Promise.race([p,new Promise<any>((_,rej)=>setTimeout(()=>rej(new Error("to")),2000))]);rtts.push(info.rtt);if(info.hits>0)hits++}catch(e){rtts.push(2000)};await sleep(10);}
    const m=getMetrics();const s=[...rtts].sort((a,b)=>a-b);console.log(`${t.l}: ${hits}/50 hits(${(hits/50*100).toFixed(0)}%) avgRTT=${(rtts.reduce((a,b)=>a+b,0)/rtts.length).toFixed(0)}ms srv=${(m.serverTimes.reduce((a,b)=>a+b,0)/m.serverTimes.length).toFixed(3)}ms`);atk.ws.close();def.ws.close();await sleep(100);}
  console.log("\nDone.");wss.close();http.close();process.exit(0);}
main().catch(e=>{console.error(e);process.exit(1)});
