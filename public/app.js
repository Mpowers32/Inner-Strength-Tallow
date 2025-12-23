const boardsContainer = document.getElementById("boards");
const listsContainer = document.getElementById("lists");
const boardTitle = document.getElementById("board-title");
const boardSubtitle = document.getElementById("board-subtitle");
const newBoardButton = document.getElementById("new-board");
const newListButton = document.getElementById("new-list");
const renameBoardButton = document.getElementById("rename-board");
const deleteBoardButton = document.getElementById("delete-board");

let currentBoardId = null;
let boardSocket = null;
let boardsSocket = null;

const fetchJson = async (url, options) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    const message = await response.json().catch(() => ({}));
    throw new Error(message.error || "Request failed");
  }
  return response.json();
};

const renderBoards = (boards) => {
  boardsContainer.innerHTML = "";
  boards.forEach((board) => {
    const button = document.createElement("button");
    button.className =
      "board-card" + (board.id === currentBoardId ? " active" : "");
    button.textContent = board.name;
    button.addEventListener("click", () => selectBoard(board.id));
    boardsContainer.appendChild(button);
  });
  if (boards.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No boards yet. Create one to get started.";
    boardsContainer.appendChild(empty);
  }
};

const renderBoardDetail = (board) => {
  if (!board) {
    boardTitle.textContent = "Select a board";
    boardSubtitle.textContent = "Choose a board to see its lists.";
    listsContainer.innerHTML = "";
    newListButton.disabled = true;
    renameBoardButton.disabled = true;
    deleteBoardButton.disabled = true;
    return;
  }

  boardTitle.textContent = board.name;
  boardSubtitle.textContent = `${board.lists.length} list${
    board.lists.length === 1 ? "" : "s"
  }`;
  newListButton.disabled = false;
  renameBoardButton.disabled = false;
  deleteBoardButton.disabled = false;

  listsContainer.innerHTML = "";
  board.lists.forEach((list) => {
    const listCard = document.createElement("div");
    listCard.className = "list";

    const header = document.createElement("div");
    header.className = "list-header";

    const title = document.createElement("h3");
    title.textContent = list.name;

    const listActions = document.createElement("div");
    listActions.className = "list-actions";

    const rename = document.createElement("button");
    rename.textContent = "Rename";
    rename.addEventListener("click", () => renameList(list.id, list.name));

    const remove = document.createElement("button");
    remove.textContent = "Delete";
    remove.addEventListener("click", () => deleteList(list.id));

    listActions.append(rename, remove);
    header.append(title, listActions);

    const cards = document.createElement("div");
    cards.className = "cards";
    list.cards.forEach((card) => {
      const cardEl = document.createElement("div");
      cardEl.className = "card";

      const label = document.createElement("span");
      label.textContent = card.title;

      const actions = document.createElement("div");
      actions.className = "card-actions";

      const edit = document.createElement("button");
      edit.textContent = "Edit";
      edit.addEventListener("click", () => renameCard(list.id, card.id, card.title));

      const removeCard = document.createElement("button");
      removeCard.textContent = "Delete";
      removeCard.addEventListener("click", () => deleteCard(list.id, card.id));

      actions.append(edit, removeCard);
      cardEl.append(label, actions);
      cards.appendChild(cardEl);
    });

    const addCard = document.createElement("button");
    addCard.className = "add-card";
    addCard.textContent = "Add card";
    addCard.addEventListener("click", () => addCardToList(list.id));

    listCard.append(header, cards, addCard);
    listsContainer.appendChild(listCard);
  });
};

const loadBoards = async () => {
  const boards = await fetchJson("/api/boards");
  renderBoards(boards);
  if (currentBoardId && !boards.find((board) => board.id === currentBoardId)) {
    currentBoardId = null;
    renderBoardDetail(null);
  }
};

const loadBoard = async (boardId) => {
  const board = await fetchJson(`/api/boards/${boardId}`);
  renderBoardDetail(board);
};

const openBoardsSocket = () => {
  if (boardsSocket) {
    boardsSocket.close();
  }
  const socket = new WebSocket(`${window.location.origin.replace("http", "ws")}/ws?boardId=boards`);
  socket.addEventListener("message", () => loadBoards());
  boardsSocket = socket;
};

const openBoardSocket = (boardId) => {
  if (boardSocket) {
    boardSocket.close();
  }
  const socket = new WebSocket(
    `${window.location.origin.replace("http", "ws")}/ws?boardId=${boardId}`
  );
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "board.deleted") {
      currentBoardId = null;
      renderBoardDetail(null);
      loadBoards();
      return;
    }
    if (currentBoardId) {
      loadBoard(currentBoardId);
    }
  });
  boardSocket = socket;
};

const selectBoard = async (boardId) => {
  currentBoardId = boardId;
  await loadBoard(boardId);
  renderBoards(await fetchJson("/api/boards"));
  openBoardSocket(boardId);
};

const createBoard = async () => {
  const name = prompt("Board name?");
  if (!name) return;
  const board = await fetchJson("/api/boards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  await loadBoards();
  selectBoard(board.id);
};

const renameBoard = async () => {
  if (!currentBoardId) return;
  const name = prompt("New board name?");
  if (!name) return;
  await fetchJson(`/api/boards/${currentBoardId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  await loadBoards();
  await loadBoard(currentBoardId);
};

const deleteBoard = async () => {
  if (!currentBoardId) return;
  const confirmed = confirm("Delete this board?");
  if (!confirmed) return;
  await fetchJson(`/api/boards/${currentBoardId}`, { method: "DELETE" });
  currentBoardId = null;
  renderBoardDetail(null);
  await loadBoards();
};

const createList = async () => {
  if (!currentBoardId) return;
  const name = prompt("List name?");
  if (!name) return;
  await fetchJson(`/api/boards/${currentBoardId}/lists`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  await loadBoard(currentBoardId);
};

const renameList = async (listId, currentName) => {
  const name = prompt("New list name?", currentName);
  if (!name) return;
  await fetchJson(`/api/boards/${currentBoardId}/lists/${listId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  await loadBoard(currentBoardId);
};

const deleteList = async (listId) => {
  const confirmed = confirm("Delete this list?");
  if (!confirmed) return;
  await fetchJson(`/api/boards/${currentBoardId}/lists/${listId}`, {
    method: "DELETE",
  });
  await loadBoard(currentBoardId);
};

const addCardToList = async (listId) => {
  const title = prompt("Card title?");
  if (!title) return;
  await fetchJson(`/api/boards/${currentBoardId}/lists/${listId}/cards`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  await loadBoard(currentBoardId);
};

const renameCard = async (listId, cardId, currentTitle) => {
  const title = prompt("New card title?", currentTitle);
  if (!title) return;
  await fetchJson(
    `/api/boards/${currentBoardId}/lists/${listId}/cards/${cardId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }
  );
  await loadBoard(currentBoardId);
};

const deleteCard = async (listId, cardId) => {
  const confirmed = confirm("Delete this card?");
  if (!confirmed) return;
  await fetchJson(
    `/api/boards/${currentBoardId}/lists/${listId}/cards/${cardId}`,
    { method: "DELETE" }
  );
  await loadBoard(currentBoardId);
};

newBoardButton.addEventListener("click", () =>
  createBoard().catch((error) => alert(error.message))
);
newListButton.addEventListener("click", () =>
  createList().catch((error) => alert(error.message))
);
renameBoardButton.addEventListener("click", () =>
  renameBoard().catch((error) => alert(error.message))
);
deleteBoardButton.addEventListener("click", () =>
  deleteBoard().catch((error) => alert(error.message))
);

openBoardsSocket();
loadBoards().catch((error) => alert(error.message));
