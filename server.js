const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

const rooms = new Map();
const code = () => crypto.randomBytes(3).toString("hex").toUpperCase();
const cleanName = (s, fallback) => String(s || fallback).trim().slice(0, 24) || fallback;
function publicRoom(r) {
  return {
    id:r.id, name:r.name, mode:r.mode, maxPlayers:r.maxPlayers,
    pieceCount:r.pieceCount, hasPassword:!!r.password,
    players:r.players.map(p=>({id:p.id,name:p.name,ready:p.ready,host:p.id===r.hostId})),
    started:r.started, code:r.id
  };
}
function listRooms() {
  return [...rooms.values()].filter(r=>r.privacy==="public" && !r.started).map(publicRoom);
}
function emitRoom(r) {
  io.to(r.id).emit("room:update", {room:publicRoom(r), state:r.state});
  io.emit("rooms:list", listRooms());
}
function initState(r) {
  return {
    turnIndex:0, pending:[], currentResult:null, extraRolls:0, gameOver:false, winner:null,
    players:r.players.map((p,i)=>({
      id:p.id,name:p.name,color:["#5aa9ff","#ff6868","#65d79a","#ffd064","#c78aff","#ff9d52","#5de0d5","#eee"][i],
      pieces:Array(r.pieceCount).fill(null), finished:0, augment:["fortune","capturer","guardian","swift"][i%4], augmentUsed:false, shieldUsed:false
    })),
    lastRoll:null, log:[`${r.name} 방이 시작되었습니다.`]
  };
}
function logState(r, msg) {
  r.state.log.unshift(msg);
  r.state.log = r.state.log.slice(0,40);
}
function broadcastGame(r) {
  io.to(r.id).emit("game:state", {room:publicRoom(r), state:r.state});
}
function currentPlayer(r) { return r.state.players[r.state.turnIndex]; }
function nextTurn(r) {
  r.state.pending=[]; r.state.currentResult=null;
  r.state.turnIndex=(r.state.turnIndex+1)%r.state.players.length;
}
function rollResult(player) {
  const rolls=[{name:"도",value:1},{name:"개",value:2},{name:"개",value:2},{name:"걸",value:3},{name:"걸",value:3},{name:"윷",value:4},{name:"모",value:5},{name:"빽도",value:-1}];
  if(player && player.augment === "fortune") rolls.push({name:"윷",value:4},{name:"모",value:5});
  return rolls[Math.floor(Math.random()*rolls.length)];
}
io.on("connection", socket => {
  socket.emit("rooms:list", listRooms());

  socket.on("rooms:list:request", () => socket.emit("rooms:list", listRooms()));

  socket.on("room:create", (data={}, ack=()=>{}) => {
    const maxPlayers=Math.max(2,Math.min(8,Number(data.maxPlayers)||4));
    const pieceCount=Math.max(1,Math.min(4,Number(data.pieceCount)||4));
    const id=code();
    const player={id:socket.id,name:cleanName(data.playerName,"플레이어"),ready:true};
    const r={
      id,name:cleanName(data.name,"새 윷놀이 방"),
      mode:data.mode==="team"?"team":"solo",
      maxPlayers,pieceCount,
      privacy:data.privacy==="private"?"private":"public",
      password:String(data.password||"").slice(0,64),
      hostId:socket.id, players:[player], started:false, state:null
    };
    rooms.set(id,r); socket.join(id); socket.data.roomId=id;
    ack({ok:true,room:publicRoom(r),state:r.state});
    emitRoom(r);
  });

  socket.on("room:join", (data={}, ack=()=>{}) => {
    const r=rooms.get(String(data.roomId||"").toUpperCase());
    if(!r) return ack({ok:false,error:"방을 찾을 수 없습니다."});
    if(r.started) return ack({ok:false,error:"이미 시작한 방입니다."});
    if(r.players.length>=r.maxPlayers) return ack({ok:false,error:"방이 가득 찼습니다."});
    if(r.privacy==="private" && data.password!==r.password) return ack({ok:false,error:"비밀번호가 틀렸습니다."});
    if(r.password && data.password!==r.password) return ack({ok:false,error:"비밀번호가 틀렸습니다."});
    if(r.players.some(p=>p.id===socket.id)) return ack({ok:true,room:publicRoom(r),state:r.state});
    r.players.push({id:socket.id,name:cleanName(data.playerName,"플레이어"),ready:false});
    socket.join(r.id); socket.data.roomId=r.id;
    ack({ok:true,room:publicRoom(r),state:r.state}); emitRoom(r);
  });

  socket.on("player:ready", (ready, ack=()=>{}) => {
    const r=rooms.get(socket.data.roomId); if(!r||r.started) return;
    const p=r.players.find(p=>p.id===socket.id); if(!p) return;
    if(p.id!==r.hostId) p.ready=!!ready;
    emitRoom(r); ack({ok:true});
  });

  socket.on("room:start", (_data, ack=()=>{}) => {
    const r=rooms.get(socket.data.roomId);
    if(!r) return ack({ok:false,error:"방이 없습니다."});
    if(socket.id!==r.hostId) return ack({ok:false,error:"방장만 시작할 수 있습니다."});
    if(r.started) return ack({ok:false,error:"이미 시작했습니다."});
    if(r.players.length<2) return ack({ok:false,error:"게임 시작에는 최소 2명이 필요합니다."});
    if(!r.players.every(p=>p.ready)) return ack({ok:false,error:"모든 참가자가 준비해야 합니다."});
    r.started=true; r.state=initState(r);
    logState(r,"게임이 시작되었습니다.");
    emitRoom(r); broadcastGame(r); ack({ok:true});
  });

  socket.on("game:roll", (_data, ack=()=>{}) => {
    const r=rooms.get(socket.data.roomId);
    if(!r||!r.started||r.state.gameOver) return ack({ok:false,error:"게임을 진행할 수 없습니다."});
    const p=currentPlayer(r);
    if(p.id!==socket.id) return ack({ok:false,error:"현재 차례가 아닙니다."});
    if(r.state.currentResult || r.state.pending.length) return ack({ok:false,error:"먼저 나온 윷 결과를 사용해 말을 이동하세요."});
    if(r.state.extraRolls>0) r.state.extraRolls--;
    const result=rollResult(p);
    r.state.pending.push(result); r.state.lastRoll=result;
    if(result.name==="윷" || result.name==="모") r.state.extraRolls++;
    logState(r,`${p.name}: ${result.name} (${result.value>0?"+":""}${result.value})`);
    if(result.name==="윷" || result.name==="모") logState(r,`${result.name}! 추가 던지기 기회가 생겼습니다.`);
    broadcastGame(r); ack({ok:true,result});
  });

  socket.on("game:choose-result", (index, ack=()=>{}) => {
    const r=rooms.get(socket.data.roomId);
    if(!r||!r.started||r.state.gameOver) return ack({ok:false,error:"게임을 진행할 수 없습니다."});
    if(currentPlayer(r).id!==socket.id) return ack({ok:false,error:"현재 차례가 아닙니다."});
    const i=Number(index);
    if(!Number.isInteger(i)||i<0||i>=r.state.pending.length) return ack({ok:false,error:"결과 선택이 올바르지 않습니다."});
    r.state.currentResult=r.state.pending.splice(i,1)[0];
    broadcastGame(r); ack({ok:true,result:r.state.currentResult});
  });

  socket.on("game:move", (pieceIndex, ack=()=>{}) => {
    const r=rooms.get(socket.data.roomId);
    if(!r||!r.started||r.state.gameOver) return ack({ok:false,error:"게임을 진행할 수 없습니다."});
    const p=currentPlayer(r), idx=Number(pieceIndex), res=r.state.currentResult;
    if(p.id!==socket.id) return ack({ok:false,error:"현재 차례가 아닙니다."});
    if(!res) return ack({ok:false,error:"먼저 이동할 결과를 선택하세요."});
    if(!Number.isInteger(idx)||idx<0||idx>=p.pieces.length) return ack({ok:false,error:"말 선택이 올바르지 않습니다."});
    const old=p.pieces[idx];
    if(old!==null && old>=19) return ack({ok:false,error:"이미 완주한 말입니다."});
    if(res.value<0 && old===null) return ack({ok:false,error:"빽도는 출발한 말이 있어야 사용할 수 있습니다."});
    let target=old===null ? Math.max(0,res.value-1) : old+res.value;
    if(p.augment==="swift" && !p.augmentUsed && res.value>0 && (old===null || old===0)) {
      target+=1; p.augmentUsed=true; logState(r,`${p.name}의 증강 [질주] 발동: 한 칸 추가 이동!`);
    }
    if(target>=19) { p.pieces[idx]=19; p.finished++; logState(r,`${p.name}의 말 ${idx+1} 완주!`); }
    else p.pieces[idx]=Math.max(0,target);

    let captured=false;
    if(p.pieces[idx]!==19) {
      const landed=p.pieces[idx];
      r.state.players.forEach(other=>{
        if(other.id===p.id) return;
        other.pieces=other.pieces.map(pos=>{
          if(pos!==landed) return pos;
          if(other.augment==="guardian" && !other.shieldUsed) {
            other.shieldUsed=true; logState(r,`${other.name}의 증강 [수호 부적]이 포획을 막았습니다!`); return pos;
          }
          captured=true; logState(r,`${p.name}이 ${other.name}의 말을 잡았습니다!`); return null;
        });
      });
      const stack=p.pieces.filter(pos=>pos===landed).length;
      if(stack>1) logState(r,`말 업기 ×${stack}`);
    }
    if(captured) {
      const bonus=p.augment==="capturer"?2:1;
      r.state.extraRolls+=bonus;
      logState(r,`${p.name} 포획 보너스: 추가 던지기 ${bonus}회!`);
    }
    r.state.currentResult=null;
    if(p.finished>=p.pieces.length) {
      r.state.gameOver=true; r.state.winner=p.name; logState(r,`${p.name} 승리!`);
    } else if(!r.state.pending.length && r.state.extraRolls===0) {
      nextTurn(); logState(r,`${currentPlayer(r).name} 차례`);
    } else if(!r.state.pending.length) {
      logState(r,`${p.name} 추가 던지기 차례 (${r.state.extraRolls}회 남음)`);
    }
    broadcastGame(r); ack({ok:true});
  });

  socket.on("game:end-turn", (_data, ack=()=>{}) => {
    const r=rooms.get(socket.data.roomId);
    if(!r||!r.started||r.state.gameOver) return ack({ok:false,error:"턴을 종료할 수 없습니다."});
    if(currentPlayer(r).id!==socket.id) return ack({ok:false,error:"현재 차례가 아닙니다."});
    if(r.state.currentResult || r.state.pending.length) return ack({ok:false,error:"나온 윷 결과를 먼저 사용하세요."});
    if(r.state.extraRolls>0) return ack({ok:false,error:`추가 던지기 ${r.state.extraRolls}회가 남아 있어 턴을 종료할 수 없습니다.`});
    nextTurn(); logState(r,`${currentPlayer(r).name} 차례`);
    broadcastGame(r); ack({ok:true});
  });

  socket.on("room:kick", (targetId, ack=()=>{}) => {
    const r=rooms.get(socket.data.roomId);
    if(!r||socket.id!==r.hostId) return ack({ok:false,error:"방장만 추방할 수 있습니다."});
    if(targetId===r.hostId) return ack({ok:false,error:"방장은 자기 자신을 추방할 수 없습니다."});
    const target=r.players.find(p=>p.id===targetId);
    if(!target) return ack({ok:false,error:"참가자를 찾을 수 없습니다."});
    const targetSocket=io.sockets.sockets.get(targetId);
    if(targetSocket){targetSocket.leave(r.id);targetSocket.emit("room:kicked",{message:"방장에서 추방되었습니다."});targetSocket.data.roomId=null;}
    r.players=r.players.filter(p=>p.id!==targetId);
    emitRoom(r); ack({ok:true});
  });

  socket.on("room:leave", (_data, ack=()=>{}) => {
    leaveRoom(socket); ack({ok:true});
  });
  socket.on("disconnect", () => leaveRoom(socket));
});
function leaveRoom(socket) {
  const id=socket.data.roomId; if(!id)return;
  const r=rooms.get(id); socket.leave(id); socket.data.roomId=null;
  if(!r)return;
  r.players=r.players.filter(p=>p.id!==socket.id);
  if(!r.players.length){rooms.delete(id);}
  else {
    if(r.hostId===socket.id) r.hostId=r.players[0].id;
    if(r.started && r.state) {
      r.state.players=r.state.players.filter(p=>p.id!==socket.id);
      r.state.turnIndex=Math.max(0,Math.min(r.state.turnIndex,r.state.players.length-1));
    }
    emitRoom(r);
  }
}
server.listen(PORT,()=>console.log(`Augment Yutnori server running on http://localhost:${PORT}`));
