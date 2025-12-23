const express = require("express");
const path = require("path");
const { randomUUID } = require("crypto");
const { WebSocketServer } = require("ws");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const store = {
  boards: [],
};

const channels = new Map();

const broadcast = (boardId, message) => {
  const channel = channels.get(boardId);
  if (!channel) return;
  const payload = JSON.stringify(message);
  for (const client of channel) {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    }
  }
};

const ensureBoard = (boardId) => store.boards.find((board) => board.id === boardId);

const ensureList = (board, listId) =>
  board.lists.find((list) => list.id === listId);

app.get("/api/boards", (req, res) => {
  res.json(store.boards.map(({ id, name }) => ({ id, name })));
});

app.post("/api/boards", (req, res) => {
  const name = req.body?.name?.trim();
  if (!name) {
    return res.status(400).json({ error: "Board name is required." });
  }
  const board = { id: randomUUID(), name, lists: [] };
  store.boards.push(board);
  broadcast("boards", { type: "board.created", board });
  res.status(201).json(board);
});

app.get("/api/boards/:boardId", (req, res) => {
  const board = ensureBoard(req.params.boardId);
  if (!board) {
    return res.status(404).json({ error: "Board not found." });
  }
  res.json(board);
});

app.put("/api/boards/:boardId", (req, res) => {
  const board = ensureBoard(req.params.boardId);
  if (!board) {
    return res.status(404).json({ error: "Board not found." });
  }
  const name = req.body?.name?.trim();
  if (!name) {
    return res.status(400).json({ error: "Board name is required." });
  }
  board.name = name;
  broadcast("boards", { type: "board.updated", board });
  broadcast(board.id, { type: "board.updated", board });
  res.json(board);
});

app.delete("/api/boards/:boardId", (req, res) => {
  const boardIndex = store.boards.findIndex(
    (board) => board.id === req.params.boardId
  );
  if (boardIndex === -1) {
    return res.status(404).json({ error: "Board not found." });
  }
  const [removed] = store.boards.splice(boardIndex, 1);
  broadcast("boards", { type: "board.deleted", boardId: removed.id });
  broadcast(removed.id, { type: "board.deleted", boardId: removed.id });
  res.json({ success: true });
});

app.post("/api/boards/:boardId/lists", (req, res) => {
  const board = ensureBoard(req.params.boardId);
  if (!board) {
    return res.status(404).json({ error: "Board not found." });
  }
  const name = req.body?.name?.trim();
  if (!name) {
    return res.status(400).json({ error: "List name is required." });
  }
  const list = { id: randomUUID(), name, cards: [] };
  board.lists.push(list);
  broadcast(board.id, { type: "list.created", boardId: board.id, list });
  res.status(201).json(list);
});

app.put("/api/boards/:boardId/lists/:listId", (req, res) => {
  const board = ensureBoard(req.params.boardId);
  if (!board) {
    return res.status(404).json({ error: "Board not found." });
  }
  const list = ensureList(board, req.params.listId);
  if (!list) {
    return res.status(404).json({ error: "List not found." });
  }
  const name = req.body?.name?.trim();
  if (!name) {
    return res.status(400).json({ error: "List name is required." });
  }
  list.name = name;
  broadcast(board.id, { type: "list.updated", boardId: board.id, list });
  res.json(list);
});

app.delete("/api/boards/:boardId/lists/:listId", (req, res) => {
  const board = ensureBoard(req.params.boardId);
  if (!board) {
    return res.status(404).json({ error: "Board not found." });
  }
  const listIndex = board.lists.findIndex(
    (list) => list.id === req.params.listId
  );
  if (listIndex === -1) {
    return res.status(404).json({ error: "List not found." });
  }
  const [removed] = board.lists.splice(listIndex, 1);
  broadcast(board.id, {
    type: "list.deleted",
    boardId: board.id,
    listId: removed.id,
  });
  res.json({ success: true });
});

app.post("/api/boards/:boardId/lists/:listId/cards", (req, res) => {
  const board = ensureBoard(req.params.boardId);
  if (!board) {
    return res.status(404).json({ error: "Board not found." });
  }
  const list = ensureList(board, req.params.listId);
  if (!list) {
    return res.status(404).json({ error: "List not found." });
  }
  const title = req.body?.title?.trim();
  if (!title) {
    return res.status(400).json({ error: "Card title is required." });
  }
  const card = { id: randomUUID(), title };
  list.cards.push(card);
  broadcast(board.id, {
    type: "card.created",
    boardId: board.id,
    listId: list.id,
    card,
  });
  res.status(201).json(card);
});

app.put("/api/boards/:boardId/lists/:listId/cards/:cardId", (req, res) => {
  const board = ensureBoard(req.params.boardId);
  if (!board) {
    return res.status(404).json({ error: "Board not found." });
  }
  const list = ensureList(board, req.params.listId);
  if (!list) {
    return res.status(404).json({ error: "List not found." });
  }
  const card = list.cards.find((item) => item.id === req.params.cardId);
  if (!card) {
    return res.status(404).json({ error: "Card not found." });
  }
  const title = req.body?.title?.trim();
  if (!title) {
    return res.status(400).json({ error: "Card title is required." });
  }
  card.title = title;
  broadcast(board.id, {
    type: "card.updated",
    boardId: board.id,
    listId: list.id,
    card,
  });
  res.json(card);
});

app.delete("/api/boards/:boardId/lists/:listId/cards/:cardId", (req, res) => {
  const board = ensureBoard(req.params.boardId);
  if (!board) {
    return res.status(404).json({ error: "Board not found." });
  }
  const list = ensureList(board, req.params.listId);
  if (!list) {
    return res.status(404).json({ error: "List not found." });
  }
  const cardIndex = list.cards.findIndex(
    (item) => item.id === req.params.cardId
  );
  if (cardIndex === -1) {
    return res.status(404).json({ error: "Card not found." });
  }
  const [removed] = list.cards.splice(cardIndex, 1);
  broadcast(board.id, {
    type: "card.deleted",
    boardId: board.id,
    listId: list.id,
    cardId: removed.id,
  });
  res.json({ success: true });
});

const server = app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  if (requestUrl.pathname !== "/ws") {
    socket.destroy();
    return;
  }
  const boardId = requestUrl.searchParams.get("boardId");
  if (!boardId) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.boardId = boardId;
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", (ws) => {
  const boardId = ws.boardId;
  if (!channels.has(boardId)) {
    channels.set(boardId, new Set());
  }
  channels.get(boardId).add(ws);

  ws.on("close", () => {
    const channel = channels.get(boardId);
    if (!channel) return;
    channel.delete(ws);
    if (channel.size === 0) {
      channels.delete(boardId);
    }
  });
});
