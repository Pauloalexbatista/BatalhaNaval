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

io.on('connection', (socket) => {
  // Criar Sala
  socket.on('create_room', () => {
    let roomId = generateRoomCode();
    while (rooms.has(roomId)) {
      roomId = generateRoomCode();
    }

    const room = {
      id: roomId,
      players: {
        1: { socketId: socket.id, ready: false, ships: [], hitsTaken: new Set(), missesTaken: new Set() },
        2: null
      },
      currentTurn: 1,
      phase: 'waiting' // waiting -> setup -> battle -> gameover
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

  // Entrar na Sala
  socket.on('join_room', (roomId) => {
    const code = (roomId || '').trim().toUpperCase();
    const room = rooms.get(code);

    if (!room) {
      return socket.emit('join_error', 'Sala não encontrada. Verifique o código ou crie uma nova!');
    }

    if (room.players[2] !== null) {
      return socket.emit('join_error', 'Esta sala já está cheia (2 jogadores).');
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
      coords: s.coords // array of "row,col"
    }));
    player.ready = true;

    // Avisar o adversário que este jogador está pronto
    socket.to(socket.roomId).emit('opponent_ready');

    // Se ambos estiverem prontos, começa a batalha!
    if (room.players[1]?.ready && room.players[2]?.ready) {
      room.phase = 'battle';
      room.currentTurn = 1; // Jogador 1 começa

      io.to(room.players[1].socketId).emit('battle_start', {
        yourTurn: true,
        currentTurn: 1
      });

      io.to(room.players[2].socketId).emit('battle_start', {
        yourTurn: false,
        currentTurn: 1
      });
    }
  });

  // Disparar Salva de 3 tiros
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
                // Se não fizer parte do próprio barco e não tiver sido acertado
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
        winnerSocket: socket.id
      });
    } else {
      // Passar a vez ao outro jogador
      room.currentTurn = defenderNum;
      salvoOutcome.nextTurn = defenderNum;

      io.to(room.id).emit('salvo_results', salvoOutcome);
      io.to(shooter.socketId).emit('turn_change', { yourTurn: false, currentTurn: defenderNum });
      io.to(defender.socketId).emit('turn_change', { yourTurn: true, currentTurn: defenderNum });
    }
  });

  // Pedido de Revanche
  socket.on('request_rematch', () => {
    const room = rooms.get(socket.roomId);
    if (!room) return;

    if (!room.rematchVotes) room.rematchVotes = new Set();
    room.rematchVotes.add(socket.playerNumber);

    if (room.rematchVotes.size >= 2) {
      // Reiniciar jogo
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
      socket.to(socket.roomId).emit('player_disconnected', {
        playerNumber: socket.playerNumber
      });
      rooms.delete(socket.roomId);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(`⚓ BATALHA NAVAL ARCADE MULTIPLAYER ONLINE ⚓`);
  console.log(`Porta: ${PORT}`);
  console.log(`Acesse: http://localhost:${PORT}`);
  console.log(`===============================================`);
});
