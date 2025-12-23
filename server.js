const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const DATA_PATH = path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

const defaultData = () => ({
  boards: [],
  lists: [],
  cards: []
});

const loadData = () => {
  if (!fs.existsSync(DATA_PATH)) {
    return defaultData();
  }
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.error('Failed to read data.json', error);
    return defaultData();
  }
};

const saveData = (data) => {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
};

const nextPosition = (items) => (items.length === 0 ? 0 : Math.max(...items.map((item) => item.position)) + 1);
const sortByPosition = (items) => [...items].sort((a, b) => a.position - b.position);

const ensureBoardExists = (data) => {
  if (data.boards.length === 0) {
    const board = {
      id: crypto.randomUUID(),
      title: 'Default Board',
      position: 0
    };
    data.boards.push(board);
  }
};

const updatePositions = (items, orderedIds) => {
  orderedIds.forEach((id, index) => {
    const item = items.find((entry) => entry.id === id);
    if (item) {
      item.position = index;
    }
  });
};

const sendJson = (res, statusCode, data) => {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
};

const sendStatus = (res, statusCode) => {
  res.writeHead(statusCode);
  res.end();
};

const parseBody = (req) => new Promise((resolve, reject) => {
  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    if (!body) {
      resolve(null);
      return;
    }
    try {
      resolve(JSON.parse(body));
    } catch (error) {
      reject(error);
    }
  });
  req.on('error', reject);
});

const handleApi = async (req, res, pathname) => {
  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] !== 'api') {
    return false;
  }

  let body = null;
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    try {
      body = await parseBody(req);
    } catch (error) {
      sendJson(res, 400, { message: 'Invalid JSON body.' });
      return true;
    }
  }

  const data = loadData();

  if (segments.length === 2 && segments[1] === 'boards') {
    if (req.method === 'GET') {
      ensureBoardExists(data);
      saveData(data);
      sendJson(res, 200, sortByPosition(data.boards));
      return true;
    }
    if (req.method === 'POST') {
      const title = body?.title?.trim() || 'Untitled Board';
      const board = {
        id: crypto.randomUUID(),
        title,
        position: nextPosition(data.boards)
      };
      data.boards.push(board);
      saveData(data);
      sendJson(res, 201, board);
      return true;
    }
  }

  if (segments.length === 3 && segments[1] === 'boards') {
    const boardId = segments[2];
    if (req.method === 'PUT') {
      const board = data.boards.find((entry) => entry.id === boardId);
      if (!board) {
        sendJson(res, 404, { message: 'Board not found.' });
        return true;
      }
      board.title = body?.title?.trim() || board.title;
      saveData(data);
      sendJson(res, 200, board);
      return true;
    }
    if (req.method === 'DELETE') {
      const boardIndex = data.boards.findIndex((entry) => entry.id === boardId);
      if (boardIndex === -1) {
        sendJson(res, 404, { message: 'Board not found.' });
        return true;
      }
      data.boards.splice(boardIndex, 1);
      const remainingLists = data.lists.filter((list) => list.boardId !== boardId);
      data.lists = remainingLists;
      data.cards = data.cards.filter((card) => remainingLists.some((list) => list.id === card.listId));
      saveData(data);
      sendStatus(res, 204);
      return true;
    }
  }

  if (segments.length === 4 && segments[1] === 'boards' && segments[3] === 'lists') {
    const boardId = segments[2];
    if (req.method === 'GET') {
      const lists = data.lists.filter((list) => list.boardId === boardId);
      sendJson(res, 200, sortByPosition(lists));
      return true;
    }
    if (req.method === 'POST') {
      const title = body?.title?.trim() || 'Untitled List';
      const list = {
        id: crypto.randomUUID(),
        boardId,
        title,
        position: nextPosition(data.lists.filter((entry) => entry.boardId === boardId))
      };
      data.lists.push(list);
      saveData(data);
      sendJson(res, 201, list);
      return true;
    }
  }

  if (segments.length === 5 && segments[1] === 'boards' && segments[3] === 'lists' && segments[4] === 'reorder') {
    const boardId = segments[2];
    if (req.method === 'POST') {
      const orderedIds = body?.orderedIds;
      if (!Array.isArray(orderedIds)) {
        sendJson(res, 400, { message: 'orderedIds must be an array.' });
        return true;
      }
      const lists = data.lists.filter((list) => list.boardId === boardId);
      updatePositions(lists, orderedIds);
      saveData(data);
      sendJson(res, 200, sortByPosition(lists));
      return true;
    }
  }

  if (segments.length === 3 && segments[1] === 'lists') {
    const listId = segments[2];
    if (req.method === 'PUT') {
      const list = data.lists.find((entry) => entry.id === listId);
      if (!list) {
        sendJson(res, 404, { message: 'List not found.' });
        return true;
      }
      list.title = body?.title?.trim() || list.title;
      saveData(data);
      sendJson(res, 200, list);
      return true;
    }
    if (req.method === 'DELETE') {
      const listIndex = data.lists.findIndex((entry) => entry.id === listId);
      if (listIndex === -1) {
        sendJson(res, 404, { message: 'List not found.' });
        return true;
      }
      data.lists.splice(listIndex, 1);
      data.cards = data.cards.filter((card) => card.listId !== listId);
      saveData(data);
      sendStatus(res, 204);
      return true;
    }
  }

  if (segments.length === 4 && segments[1] === 'lists' && segments[3] === 'cards') {
    const listId = segments[2];
    if (req.method === 'GET') {
      const cards = data.cards.filter((card) => card.listId === listId);
      sendJson(res, 200, sortByPosition(cards));
      return true;
    }
    if (req.method === 'POST') {
      const list = data.lists.find((entry) => entry.id === listId);
      if (!list) {
        sendJson(res, 404, { message: 'List not found.' });
        return true;
      }
      const title = body?.title?.trim() || 'Untitled Card';
      const card = {
        id: crypto.randomUUID(),
        listId,
        boardId: list.boardId,
        title,
        position: nextPosition(data.cards.filter((entry) => entry.listId === listId))
      };
      data.cards.push(card);
      saveData(data);
      sendJson(res, 201, card);
      return true;
    }
  }

  if (segments.length === 5 && segments[1] === 'lists' && segments[3] === 'cards' && segments[4] === 'reorder') {
    const listId = segments[2];
    if (req.method === 'POST') {
      const orderedIds = body?.orderedIds;
      if (!Array.isArray(orderedIds)) {
        sendJson(res, 400, { message: 'orderedIds must be an array.' });
        return true;
      }
      const cards = data.cards.filter((card) => card.listId === listId);
      updatePositions(cards, orderedIds);
      saveData(data);
      sendJson(res, 200, sortByPosition(cards));
      return true;
    }
  }

  if (segments.length === 3 && segments[1] === 'cards') {
    const cardId = segments[2];
    if (req.method === 'PUT') {
      const card = data.cards.find((entry) => entry.id === cardId);
      if (!card) {
        sendJson(res, 404, { message: 'Card not found.' });
        return true;
      }
      card.title = body?.title?.trim() || card.title;
      saveData(data);
      sendJson(res, 200, card);
      return true;
    }
    if (req.method === 'DELETE') {
      const cardIndex = data.cards.findIndex((entry) => entry.id === cardId);
      if (cardIndex === -1) {
        sendJson(res, 404, { message: 'Card not found.' });
        return true;
      }
      data.cards.splice(cardIndex, 1);
      saveData(data);
      sendStatus(res, 204);
      return true;
    }
  }

  if (segments.length === 4 && segments[1] === 'cards' && segments[3] === 'move') {
    const cardId = segments[2];
    if (req.method === 'POST') {
      const card = data.cards.find((entry) => entry.id === cardId);
      if (!card) {
        sendJson(res, 404, { message: 'Card not found.' });
        return true;
      }
      const { toListId, toIndex } = body || {};
      if (!toListId || typeof toIndex !== 'number') {
        sendJson(res, 400, { message: 'toListId and toIndex are required.' });
        return true;
      }
      const fromListId = card.listId;
      const sourceCards = sortByPosition(data.cards.filter((entry) => entry.listId === fromListId && entry.id !== card.id));
      const targetCards = sortByPosition(data.cards.filter((entry) => entry.listId === toListId && entry.id !== card.id));

      const insertIndex = Math.max(0, Math.min(toIndex, targetCards.length));
      targetCards.splice(insertIndex, 0, card);

      sourceCards.forEach((entry, index) => {
        entry.position = index;
      });

      targetCards.forEach((entry, index) => {
        entry.position = index;
        entry.listId = toListId;
      });

      saveData(data);
      sendJson(res, 200, {
        moved: card,
        source: sourceCards,
        target: targetCards
      });
      return true;
    }
  }

  sendJson(res, 404, { message: 'Not found.' });
  return true;
};

const serveStatic = (req, res, pathname) => {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.normalize(filePath).replace(/^\.+/, '');
  const resolvedPath = path.join(PUBLIC_DIR, filePath);
  if (!resolvedPath.startsWith(PUBLIC_DIR)) {
    sendStatus(res, 403);
    return;
  }
  fs.readFile(resolvedPath, (err, content) => {
    if (err) {
      sendStatus(res, 404);
      return;
    }
    const ext = path.extname(resolvedPath);
    const contentType = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript'
    }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname.startsWith('/api')) {
    await handleApi(req, res, pathname);
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
