const state = {
  board: null,
  lists: [],
  cardsByList: {}
};

const statusEl = document.getElementById('status');
const listsEl = document.getElementById('lists');
const boardTitleEl = document.getElementById('board-title');
const addListForm = document.getElementById('add-list-form');

const setStatus = (message) => {
  statusEl.textContent = message || '';
};

const fetchJSON = async (url, options = {}) => {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json'
    },
    ...options
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Request failed');
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
};

const loadBoard = async () => {
  const boards = await fetchJSON('/api/boards');
  state.board = boards[0];
  boardTitleEl.textContent = state.board.title;
};

const loadLists = async () => {
  const lists = await fetchJSON(`/api/boards/${state.board.id}/lists`);
  state.lists = lists;
  const cardsByList = {};
  await Promise.all(
    lists.map(async (list) => {
      const cards = await fetchJSON(`/api/lists/${list.id}/cards`);
      cardsByList[list.id] = cards;
    })
  );
  state.cardsByList = cardsByList;
};

const render = () => {
  listsEl.innerHTML = '';
  state.lists.forEach((list) => {
    const listEl = document.createElement('div');
    listEl.className = 'list';
    listEl.dataset.listId = list.id;

    const header = document.createElement('div');
    header.className = 'list__header';

    const title = document.createElement('div');
    title.className = 'list__title';
    title.textContent = list.title;

    header.appendChild(title);
    listEl.appendChild(header);

    const cardsEl = document.createElement('div');
    cardsEl.className = 'list__cards';
    cardsEl.dataset.listId = list.id;

    (state.cardsByList[list.id] || []).forEach((card) => {
      const cardEl = document.createElement('div');
      cardEl.className = 'card';
      cardEl.textContent = card.title;
      cardEl.dataset.cardId = card.id;
      cardsEl.appendChild(cardEl);
    });

    const form = document.createElement('form');
    form.className = 'list__form';
    form.innerHTML = `
      <input type="text" name="title" placeholder="Add a card" required />
      <button type="submit">Add</button>
    `;

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = form.querySelector('input');
      const titleValue = input.value.trim();
      if (!titleValue) {
        return;
      }
      const previousCards = [...(state.cardsByList[list.id] || [])];
      const optimisticCard = {
        id: `temp-${Date.now()}`,
        title: titleValue,
        listId: list.id,
        position: previousCards.length
      };
      state.cardsByList[list.id] = [...previousCards, optimisticCard];
      render();
      input.value = '';
      try {
        const created = await fetchJSON(`/api/lists/${list.id}/cards`, {
          method: 'POST',
          body: JSON.stringify({ title: titleValue })
        });
        state.cardsByList[list.id] = [...previousCards, created];
        render();
      } catch (error) {
        state.cardsByList[list.id] = previousCards;
        render();
        setStatus(`Failed to add card: ${error.message}`);
      }
    });

    listEl.appendChild(cardsEl);
    listEl.appendChild(form);
    listsEl.appendChild(listEl);
  });

  enableDragAndDrop();
};

const enableDragAndDrop = () => {
  new Sortable(listsEl, {
    animation: 150,
    ghostClass: 'drag-ghost',
    onEnd: async () => {
      const previousLists = [...state.lists];
      const orderedIds = Array.from(listsEl.children).map((child) => child.dataset.listId);
      state.lists = orderedIds
        .map((id) => state.lists.find((list) => list.id === id))
        .filter(Boolean);
      try {
        await fetchJSON(`/api/boards/${state.board.id}/lists/reorder`, {
          method: 'POST',
          body: JSON.stringify({ orderedIds })
        });
      } catch (error) {
        state.lists = previousLists;
        render();
        setStatus(`Failed to reorder lists: ${error.message}`);
      }
    }
  });

  document.querySelectorAll('.list__cards').forEach((cardsEl) => {
    new Sortable(cardsEl, {
      group: 'cards',
      animation: 150,
      ghostClass: 'drag-ghost',
      onEnd: async (event) => {
        const fromListId = event.from.dataset.listId;
        const toListId = event.to.dataset.listId;
        const previousState = JSON.parse(JSON.stringify(state.cardsByList));
        const orderedIds = Array.from(event.to.children).map((child) => child.dataset.cardId);

        if (fromListId === toListId) {
          state.cardsByList[toListId] = orderedIds
            .map((id) => previousState[toListId].find((card) => card.id === id))
            .filter(Boolean);
          try {
            await fetchJSON(`/api/lists/${toListId}/cards/reorder`, {
              method: 'POST',
              body: JSON.stringify({ orderedIds })
            });
          } catch (error) {
            state.cardsByList = previousState;
            render();
            setStatus(`Failed to reorder cards: ${error.message}`);
          }
          return;
        }

        const movedCardId = event.item.dataset.cardId;
        const sourceCards = previousState[fromListId].filter((card) => card.id !== movedCardId);
        const targetCards = orderedIds
          .map((id) => {
            if (id === movedCardId) {
              return previousState[fromListId].find((card) => card.id === movedCardId);
            }
            return previousState[toListId].find((card) => card.id === id);
          })
          .filter(Boolean);

        state.cardsByList[fromListId] = sourceCards;
        state.cardsByList[toListId] = targetCards.map((card) => ({
          ...card,
          listId: toListId
        }));

        render();

        try {
          await fetchJSON(`/api/cards/${movedCardId}/move`, {
            method: 'POST',
            body: JSON.stringify({ toListId, toIndex: event.newIndex })
          });
        } catch (error) {
          state.cardsByList = previousState;
          render();
          setStatus(`Failed to move card: ${error.message}`);
        }
      }
    });
  });
};

addListForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = addListForm.querySelector('input');
  const titleValue = input.value.trim();
  if (!titleValue) {
    return;
  }
  const previousLists = [...state.lists];
  const optimisticList = {
    id: `temp-${Date.now()}`,
    title: titleValue,
    position: previousLists.length
  };
  state.lists = [...previousLists, optimisticList];
  state.cardsByList[optimisticList.id] = [];
  render();
  input.value = '';
  try {
    const created = await fetchJSON(`/api/boards/${state.board.id}/lists`, {
      method: 'POST',
      body: JSON.stringify({ title: titleValue })
    });
    state.lists = [...previousLists, created];
    state.cardsByList[created.id] = [];
    render();
  } catch (error) {
    state.lists = previousLists;
    render();
    setStatus(`Failed to add list: ${error.message}`);
  }
});

const init = async () => {
  try {
    await loadBoard();
    await loadLists();
    render();
  } catch (error) {
    setStatus(`Failed to load board: ${error.message}`);
  }
};

init();
