const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// 翻譯 API（伺服器端處理，不暴露 Key 給前端）
app.post('/translate', async (req, res) => {
  const { text, source, target } = req.body;
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API Key 未設定' });

  try {
    const resp = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: text, source, target, format: 'text' })
      }
    );
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error?.message || 'Translation failed');
    const translated = data.data?.translations?.[0]?.translatedText || '';
    res.json({ translated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const rooms = {};

wss.on('connection', (ws) => {
  let currentRoom = null;

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'join') {
        const roomId = msg.room.toUpperCase();
        currentRoom = roomId;
        ws.roomId = roomId;
        ws.lang = msg.lang;
        if (!rooms[roomId]) rooms[roomId] = new Set();
        rooms[roomId].add(ws);
        broadcastRoomInfo(roomId);
      }
      if (msg.type === 'translation' || msg.type === 'interim') {
        if (!currentRoom || !rooms[currentRoom]) return;
        rooms[currentRoom].forEach((client) => {
          if (client !== ws && client.readyState === 1) {
            client.send(JSON.stringify({ ...msg, from: ws.lang }));
          }
        });
      }
    } catch (e) { console.error(e); }
  });

  ws.on('close', () => {
    if (currentRoom && rooms[currentRoom]) {
      rooms[currentRoom].delete(ws);
      if (rooms[currentRoom].size === 0) delete rooms[currentRoom];
      else broadcastRoomInfo(currentRoom);
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
server.listen(PORT, () => console.log(`伺服器啟動：http://localhost:${PORT}`));
