const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Estado das salas
const rooms = new Map();

// Definições da Frota Clássica (8 Navios, 20 Blocos no total)
const SHIP_TEMPLATES = [
  { type: 'carrier_t', name: 'Porta-Aviões', size: 5, shape: [[0, 0], [0, 1], [0, 2], [1, 1], [2, 1]] },
  { type: 'battleship', name: 'Couraçado', size: 4, shape: [[0, 0], [0, 1], [0, 2], [0, 3]] },
  { type: 'destroyer_1', name: 'Contratorpedeiro 1', size: 3, shape: [[0, 0], [0, 1], [0, 2]] },
  { type: 'destroyer_2', name: 'Contratorpedeiro 2', size: 3, shape: [[0, 0], [0, 1], [0, 2]] },
  { type: 'patrol', name: 'Torpedeiro', size: 2, shape: [[0, 0], [0, 1]] },
  { type: 'sub_1', name: 'Submarino 1', size: 1, shape: [[0, 0]] },
  { type: 'sub_2', name: 'Submarino 2', size: 1, shape: [[0, 0]] },
  { type: 'sub_3', name: 'Submarino 3', size: 1, shape: [[0, 0]] }
];

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Direções para os 8 vizinhos (para preencher em redor de navio afundado)
const SURROUNDING_OFFSETS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1]
];

// Funções de posicionamento automático (usado pela IA e validações)
function rotateShape(shape, rot) {
  let current = shape.map(([r, c]) => [r, c]);
  for (let i = 0; i < rot; i++) {
    current = current.map(([r, c]) => [c, -r]);
  }
  const minR = Math.min(...current.map(([r]) => r));
  const minC = Math.min(...current.map(([, c]) => c));
  return current.map(([r, c]) => [r - minR, c - minC]);
}

function getShipAbsoluteCoords(template, rot, startR, startC) {
  const rotated = rotateShape(template.shape, rot);
  return rotated.map(([dr, dc]) => [startR + dr, startC + dc]);
}

function isValidFleetPlacement(shipCoords, placedShips) {
  const occupiedCoords = new Set();
  const forbiddenNeighborhood = new Set();

  for (const ship of placedShips) {
    for (const coordStr of ship.coords) {
      occupiedCoords.add(coordStr);
      const [sr, sc] = coordStr.split(',').map(Number);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          forbiddenNeighborhood.add(`${sr + dr},${sc + dc}`);
        }
      }
    }
  }

  for (const [r, c] of shipCoords) {
    if (r < 0 || r >= 10 || c < 0 || c >= 10) return false;
    const key = `${r},${c}`;
    if (occupiedCoords.has(key)) return false;
    if (forbiddenNeighborhood.has(key)) return false;
  }

  return true;
}

function generateAIFleet() {
  const fleet = [];
  for (const tmpl of SHIP_TEMPLATES) {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 500) {
      attempts++;
      const rot = Math.floor(Math.random() * 4);
      const r = Math.floor(Math.random() * 10);
      const c = Math.floor(Math.random() * 10);
      const absCoords = getShipAbsoluteCoords(tmpl, rot, r, c);
      if (isValidFleetPlacement(absCoords, fleet)) {
        fleet.push({
          id: `ai_${tmpl.type}`,
          type: tmpl.type,
          name: tmpl.name,
          coords: absCoords.map(([cr, cc]) => `${cr},${cc}`),
          sunk: false
        });
        placed = true;
      }
    }
  }
  return fleet;
}

// Algoritmo de Mira da IA (Salva de 3 Tiros Inteligente)
function selectAISalvoTargets(room) {
  const p1 = room.players[1];
  const targets = [];
  const selectedKeys = new Set();

  function isAvailable(r, c) {
    if (r < 0 || r >= 10 || c < 0 || c >= 10) return false;
    const k = `${r},${c}`;
    if (p1.hitsTaken.has(k) || p1.missesTaken.has(k) || selectedKeys.has(k)) return false;
    return true;
  }

  // 1. Caça em redor de navios atingidos mas ainda não afundados
  const damagedAliveHits = [];
  for (const hitCoord of p1.hitsTaken) {
    // Verificar se este hit pertence a um navio ainda vivo
    const ship = p1.ships.find(s => s.coords.includes(hitCoord));
    if (ship && !ship.sunk) {
      damagedAliveHits.push(hitCoord);
    }
  }

  // Procurar ortogonalmente vizinhos de tiros certeiros
  for (const hitCoord of damagedAliveHits) {
    if (targets.length >= 3) break;
    const [hr, hc] = hitCoord.split(',').map(Number);
    const deltas = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    // Baralhar deltas para variar padrão
    deltas.sort(() => Math.random() - 0.5);

    for (const [dr, dc] of deltas) {
      const nr = hr + dr;
      const nc = hc + dc;
      if (isAvailable(nr, nc)) {
        targets.push({ row: nr, col: nc });
        selectedKeys.add(`${nr},${nc}`);
        if (targets.length >= 3) break;
      }
    }
  }

  // 2. Se ainda faltam tiros, usar padrão xadrez (alta probabilidade de encontrar navios)
  if (targets.length < 3) {
    const checkerboardCandidates = [];
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        if ((r + c) % 2 === 0 && isAvailable(r, c)) {
          checkerboardCandidates.push({ row: r, col: c });
        }
      }
    }
    checkerboardCandidates.sort(() => Math.random() - 0.5);
    while (targets.length < 3 && checkerboardCandidates.length > 0) {
      const cand = checkerboardCandidates.pop();
      if (isAvailable(cand.row, cand.col)) {
        targets.push(cand);
        selectedKeys.add(`${cand.row},${cand.col}`);
      }
    }
  }

  // 3. Fallback: Qualquer casa livre restante
  if (targets.length < 3) {
    const allRemaining = [];
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        if (isAvailable(r, c)) {
          allRemaining.push({ row: r, col: c });
        }
      }
    }
    allRemaining.sort(() => Math.random() - 0.5);
    while (targets.length < 3 && allRemaining.length > 0) {
      const cand = allRemaining.pop();
      targets.push(cand);
      selectedKeys.add(`${cand.row},${cand.col}`);
    }
  }

  return targets;
}

// Processador unificado de salva de 3 tiros
function processSalvo(room, shooterNum, targets) {
  const defenderNum = shooterNum === 1 ? 2 : 1;
  const defender = room.players[defenderNum];
  const shooter = room.players[shooterNum];

  const results = [];
  const newlySunkShips = [];
  const autoRevealedSurroundings = new Set();

  for (const target of targets) {
    const coordKey = `${target.row},${target.col}`;

    // Verificar se acertou em algum navio do defensor
    let hitShip = null;
    for (const ship of defender.ships) {
      if (ship.coords.includes(coordKey)) {
        hitShip = ship;
        break;
      }
    }

    if (hitShip) {
      defender.hitsTaken.add(coordKey);

      // Verificar se afundou o navio
      const isSunk = hitShip.coords.every(c => defender.hitsTaken.has(c));
      let justSunk = false;

      if (isSunk && !hitShip.sunk) {
        hitShip.sunk = true;
        justSunk = true;
        newlySunkShips.push({
          id: hitShip.id,
          name: hitShip.name,
          type: hitShip.type,
          coords: hitShip.coords
        });

        // Preencher automaticamente as casas ao redor deste navio afundado
        for (const c of hitShip.coords) {
          const [r, col] = c.split(',').map(Number);
          for (const [dr, dc] of SURROUNDING_OFFSETS) {
            const nr = r + dr;
            const nc = col + dc;
            if (nr >= 0 && nr < 10 && nc >= 0 && nc < 10) {
              const neighborKey = `${nr},${nc}`;
              if (!hitShip.coords.includes(neighborKey) && !defender.hitsTaken.has(neighborKey)) {
                defender.missesTaken.add(neighborKey);
                autoRevealedSurroundings.add(neighborKey);
              }
            }
          }
        }
      }

      results.push({
        coord: coordKey,
        hit: true,
        shipId: hitShip.id,
        shipType: hitShip.type,
        shipName: hitShip.name,
        sunk: isSunk,
        justSunk: justSunk
      });
    } else {
      defender.missesTaken.add(coordKey);
      results.push({
        coord: coordKey,
        hit: false
      });
    }
  }

  // Verificar vitória (se todos os navios do defensor foram afundados)
  const allSunk = defender.ships.every(s => s.sunk);

  const salvoOutcome = {
    shooter: shooterNum,
    results,
    sunkShips: newlySunkShips,
    surroundings: Array.from(autoRevealedSurroundings),
    allSunk
  };

  if (allSunk) {
    room.phase = 'gameover';
    io.to(room.id).emit('salvo_results', salvoOutcome);
    io.to(room.id).emit('game_over', {
      winner: shooterNum,
      winnerSocket: shooter?.socketId || 'AI'
    });
  } else {
    // Passar a vez ao outro jogador
    room.currentTurn = defenderNum;
    salvoOutcome.nextTurn = defenderNum;

    io.to(room.id).emit('salvo_results', salvoOutcome);

    if (shooter.socketId && shooter.socketId !== 'BOT_AI') {
      io.to(shooter.socketId).emit('turn_change', { yourTurn: false, currentTurn: defenderNum });
    }
    if (defender.socketId && defender.socketId !== 'BOT_AI') {
      io.to(defender.socketId).emit('turn_change', { yourTurn: true, currentTurn: defenderNum });
    }

    // Se o próximo jogador for a IA, agendar o disparo após pequeno delay realista
    if (room.isAI && room.currentTurn === 2) {
      setTimeout(() => {
        executeAITurn(room);
      }, 1600);
    }
  }
}

function executeAITurn(room) {
  if (!room || room.phase !== 'battle' || room.currentTurn !== 2) return;
  const aiTargets = selectAISalvoTargets(room);
  if (aiTargets.length === 3) {
    processSalvo(room, 2, aiTargets);
  }
}

io.on('connection', (socket) => {
  // Criar Sala 2 Jogadores Online
  socket.on('create_room', () => {
    let roomId = generateRoomCode();
    while (rooms.has(roomId)) {
      roomId = generateRoomCode();
    }

    const room = {
      id: roomId,
      isAI: false,
      players: {
        1: { socketId: socket.id, ready: false, ships: [], hitsTaken: new Set(), missesTaken: new Set() },
        2: null
      },
      currentTurn: 1,
      phase: 'waiting'
    };

    rooms.set(roomId, room);
    socket.join(roomId);
    socket.roomId = roomId;
    socket.playerNumber = 1;

    socket.emit('room_created', {
      roomId,
      playerNumber: 1
    });
  });

  // Criar Partida 1 Jogador vs Computador
  socket.on('create_ai_game', () => {
    let roomId = 'IA_' + generateRoomCode();
    const room = {
      id: roomId,
      isAI: true,
      players: {
        1: { socketId: socket.id, ready: false, ships: [], hitsTaken: new Set(), missesTaken: new Set() },
        2: {
          socketId: 'BOT_AI',
          ready: true,
          ships: generateAIFleet(),
          hitsTaken: new Set(),
          missesTaken: new Set()
        }
      },
      currentTurn: 1,
      phase: 'setup'
    };

    rooms.set(roomId, room);
    socket.join(roomId);
    socket.roomId = roomId;
    socket.playerNumber = 1;

    socket.emit('room_joined', {
      roomId,
      playerNumber: 1,
      isAI: true
    });

    socket.emit('start_setup', {
      roomId,
      isAI: true
    });
  });

  // Entrar na Sala
  socket.on('join_room', (roomId) => {
    const code = (roomId || '').trim().toUpperCase();
    const room = rooms.get(code);

    if (!room) {
      return socket.emit('join_error', 'Sala não encontrada. Verifique o código ou crie uma nova!');
    }

    if (room.isAI || room.players[2] !== null) {
      return socket.emit('join_error', 'Esta sala já está cheia ou é uma partida individual.');
    }

    room.players[2] = {
      socketId: socket.id,
      ready: false,
      ships: [],
      hitsTaken: new Set(),
      missesTaken: new Set()
    };
    room.phase = 'setup';

    socket.join(code);
    socket.roomId = code;
    socket.playerNumber = 2;

    socket.emit('room_joined', {
      roomId: code,
      playerNumber: 2
    });

    // Avisar o Host que o jogador 2 entrou e iniciar fase de montagem da frota
    io.to(code).emit('start_setup', {
      roomId: code
    });
  });

  // Jogador confirmou a posição dos navios
  socket.on('confirm_fleet', (ships) => {
    const room = rooms.get(socket.roomId);
    if (!room) return;

    const playerNum = socket.playerNumber;
    const player = room.players[playerNum];
    if (!player) return;

    // Normalizar navios
    player.ships = ships.map((s, idx) => ({
      id: s.id || `ship_${idx}`,
      type: s.type,
      name: s.name,
      coords: s.coords,
      sunk: false
    }));
    player.ready = true;

    if (!room.isAI) {
      socket.to(socket.roomId).emit('opponent_ready');
    }

    // Se ambos estiverem prontos (no caso da IA, já está sempre pronta!)
    if (room.players[1]?.ready && room.players[2]?.ready) {
      room.phase = 'battle';
      room.currentTurn = 1; // Jogador 1 começa sempre

      io.to(room.players[1].socketId).emit('battle_start', {
        yourTurn: true,
        currentTurn: 1,
        isAI: !!room.isAI
      });

      if (!room.isAI && room.players[2]?.socketId) {
        io.to(room.players[2].socketId).emit('battle_start', {
          yourTurn: false,
          currentTurn: 1,
          isAI: false
        });
      }
    }
  });

  // Disparar Salva de 3 tiros (do utilizador)
  socket.on('fire_salvo', (targets) => {
    const room = rooms.get(socket.roomId);
    if (!room || room.phase !== 'battle') return;

    const shooterNum = socket.playerNumber;
    if (room.currentTurn !== shooterNum) {
      return socket.emit('shot_error', 'Não é a sua vez de jogar!');
    }

    if (!Array.isArray(targets) || targets.length !== 3) {
      return socket.emit('shot_error', 'É obrigatório selecionar exatamente 3 tiros!');
    }

    processSalvo(room, shooterNum, targets);
  });

  // Pedido de Revanche
  socket.on('request_rematch', () => {
    const room = rooms.get(socket.roomId);
    if (!room) return;

    if (room.isAI) {
      // Reiniciar jogo contra IA imediatamente
      room.players[1].ready = false;
      room.players[1].ships = [];
      room.players[1].hitsTaken.clear();
      room.players[1].missesTaken.clear();

      room.players[2].ready = true;
      room.players[2].ships = generateAIFleet();
      room.players[2].hitsTaken.clear();
      room.players[2].missesTaken.clear();

      room.phase = 'setup';
      room.currentTurn = 1;

      socket.emit('start_setup', { roomId: room.id, isAI: true });
      return;
    }

    if (!room.rematchVotes) room.rematchVotes = new Set();
    room.rematchVotes.add(socket.playerNumber);

    if (room.rematchVotes.size >= 2) {
      // Reiniciar jogo para 2 jogadores
      room.players[1].ready = false;
      room.players[1].ships = [];
      room.players[1].hitsTaken.clear();
      room.players[1].missesTaken.clear();

      room.players[2].ready = false;
      room.players[2].ships = [];
      room.players[2].hitsTaken.clear();
      room.players[2].missesTaken.clear();

      room.phase = 'setup';
      room.rematchVotes.clear();

      io.to(room.id).emit('start_setup', { roomId: room.id });
    } else {
      socket.to(room.id).emit('rematch_offered');
    }
  });

  // Desconexão
  socket.on('disconnect', () => {
    if (socket.roomId && rooms.has(socket.roomId)) {
      const room = rooms.get(socket.roomId);
      if (!room.isAI) {
        socket.to(socket.roomId).emit('player_disconnected', {
          playerNumber: socket.playerNumber
        });
      }
      rooms.delete(socket.roomId);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(`⚓ BATALHA NAVAL ARCADE MULTIPLAYER & SOLO IA ⚓`);
  console.log(`Porta: ${PORT}`);
  console.log(`Acesse: http://localhost:${PORT}`);
  console.log(`===============================================`);
});
