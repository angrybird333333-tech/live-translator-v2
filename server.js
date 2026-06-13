const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));

// 房間管理
const rooms = {};

wss.on('connection', (ws) => {
  let currentRoom = null;
  let currentLang = null;

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);

      // 加入房間
      if (msg.type === 'join') {
        const roomId = msg.room.toUpperCase();
        currentRoom = roomId;
        currentLang = msg.lang;

        if (!rooms[roomId]) rooms[roomId] = new Set();
        rooms[roomId].add(ws);
        ws.roomId = roomId;
        ws.lang = msg.lang;

        // 通知房間人數
        broadcastRoomInfo(roomId);
        console.log(`[${roomId}] ${msg.lang} 加入，共 ${rooms[roomId].size} 人`);
      }

      // 翻譯結果廣播給同房間其他人
      if (msg.type === 'translation') {
        if (!currentRoom || !rooms[currentRoom]) return;
        rooms[currentRoom].forEach((client) => {
          if (client !== ws && client.readyState === 1) {
            client.send(JSON.stringify({
              type: 'translation',
              from: currentLang,
              original: msg.original,
              translated: msg.translated,
            }));
          }
        });
      }

      // 正在說話（interim）廣播
      if (msg.type === 'interim') {
        if (!currentRoom || !rooms[currentRoom]) return;
        rooms[currentRoom].forEach((client) => {
          if (client !== ws && client.readyState === 1) {
            client.send(JSON.stringify({
              type: 'interim',
              from: currentLang,
              text: msg.text,
            }));
          }
        });
      }

    } catch (e) {
      console.error('parse error', e);
    }
  });

  ws.on('close', () => {
    if (currentRoom && rooms[currentRoom]) {
      rooms[currentRoom].delete(ws);
      if (rooms[currentRoom].size === 0) {
        delete rooms[currentRoom];
      } else {
        broadcastRoomInfo(currentRoom);
      }
      console.log(`[${currentRoom}] 離線`);
    }
  });
});

function broadcastRoomInfo(roomId) {
  if (!rooms[roomId]) return;
  const count = rooms[roomId].size;
  rooms[roomId].forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify({ type: 'room_info', count }));
    }
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`伺服器啟動：http://localhost:${PORT}`);
});
