const WebSocket = require('ws');

// Usa a porta fornecida pelo Railway
const PORT = process.env.PORT || 3000;
const server = new WebSocket.Server({ port: PORT });

// Dados do jogo
let players = {};
let rations = [];

// Configurações balanceadas
const RATION_MAX = 15;              // Rações máximas no mapa
const RATION_LIFE_TIME = 12000;     // Dura 12 segundos
const SPAWN_INTERVAL = 5000;        // Nova ração a cada 5s
const LIFE_LOSS_INTERVAL = 60000;   // Perde vida a cada 60s

// Sistema de perda de vida por fome
setInterval(() => {
  const now = Date.now();
  for (const id in players) {
    const p = players[id];
    if (p.lives <= 0) continue;
    if (now - p.lastFed >= LIFE_LOSS_INTERVAL) {
      p.lives--;
      p.lastFed = now;
    }
  }
}, 10000); // Verifica a cada 10s

// Spawn de ração
function spawnRation() {
  if (rations.length >= RATION_MAX) return;

  const ration = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    x: Math.random() * 5000,
    y: Math.random() * 5000,
    createdAt: Date.now()
  };

  rations.push(ration);
  broadcast({ type: 'rationSpawn', ration });

  // Auto-remover após N segundos
  setTimeout(() => {
    rations = rations.filter(r => r.id !== ration.id);
    broadcast({ type: 'rationDespawn', id: ration.id });
  }, RATION_LIFE_TIME);
}

setInterval(spawnRation, SPAWN_INTERVAL);

// Funções utilitárias
function notifyPlayer(playerId, data) {
  const client = getClientByPlayerId(playerId);
  if (client && client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(data));
  }
}

function getClientByPlayerId(playerId) {
  for (const client of server.clients) {
    if (client.playerId === playerId) return client;
  }
  return null;
}

function broadcast(data) {
  const message = JSON.stringify(data);
  server.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Eventos WebSocket
server.on('connection', (socket) => {
  socket.playerId = null;

  socket.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      const { type } = msg;

      if (type === 'join') {
        const playerId = msg.id || (Math.random().toString(36).substr(2, 9));
        socket.playerId = playerId;

        players[playerId] = {
          id: playerId,
          x: Math.random() * 5000,
          y: Math.random() * 5000,
          size: 1,
          lives: 7,
          lastFed: Date.now(),
          skin: msg.skin || 'tabby'
        };

        // Envia estado inicial só para o jogador
        socket.send(JSON.stringify({
          type: 'init',
          playerId,
          me: players[playerId],
          others: Object.values(players).filter(p => p.id !== playerId),
          rations: [...rations]
        }));

        // Notifica todos sobre novo jogador
        broadcast({ type: 'playerJoin', player: players[playerId] });
      }

      else if (type === 'move' && socket.playerId) {
        const p = players[socket.playerId];
        if (p) {
          p.x = msg.x;
          p.y = msg.y;
          broadcast({ type: 'playerMove', id: socket.playerId, x: msg.x, y: msg.y });
        }
      }

      else if (type === 'eatRation' && socket.playerId) {
        const idx = rations.findIndex(r => r.id === msg.rationId);
        if (idx !== -1) {
          rations.splice(idx, 1);
          const p = players[socket.playerId];
          if (p) {
            p.lives = Math.min(7, p.lives + 1);
            p.lastFed = Date.now();
            broadcast({ type: 'rationEaten', playerId: socket.playerId, rationId: msg.rationId });
          }
        }
      }

    } catch (e) {
      console.error('Erro no WebSocket:', e);
    }
  });

  socket.on('close', () => {
    if (socket.playerId && players[socket.playerId]) {
      delete players[socket.playerId];
      broadcast({ type: 'playerLeave', id: socket.playerId });
    }
  });
});

console.log(`🚀 Servidor Miaulone rodando na porta ${PORT}`);