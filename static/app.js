async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Request failed");
  }
  return response.json();
}

function getInputValue(form, name) {
  return form.querySelector(`[name="${name}"]`).value;
}

async function createUser(event) {
  event.preventDefault();
  const form = event.target;
  await requestJson("/users", {
    method: "POST",
    body: JSON.stringify({
      username: getInputValue(form, "username"),
      email: getInputValue(form, "email"),
    }),
  });
  form.reset();
  alert("User created.");
}

async function createCard(event) {
  event.preventDefault();
  const form = event.target;
  await requestJson("/cards", {
    method: "POST",
    body: JSON.stringify({
      title: getInputValue(form, "title"),
      description: getInputValue(form, "description"),
      author_id: Number(getInputValue(form, "author_id")),
    }),
  });
  form.reset();
  alert("Card created.");
  await refreshNotifications();
}

async function addComment(event) {
  event.preventDefault();
  const form = event.target;
  const cardId = Number(getInputValue(form, "card_id"));
  await requestJson(`/cards/${cardId}/comments`, {
    method: "POST",
    body: JSON.stringify({
      body: getInputValue(form, "body"),
      author_id: Number(getInputValue(form, "author_id")),
    }),
  });
  form.reset();
  alert("Comment added.");
  await refreshNotifications();
}

function notificationTemplate(notification) {
  const payload = notification.payload;
  const link = payload.action_url;
  const badge = notification.read_at ? "Read" : "Unread";
  return `
    <li class="notification-item ${notification.read_at ? "read" : ""}">
      <div>
        <span class="badge">${badge}</span>
        <strong>${payload.mention}</strong> mentioned in ${payload.source}
      </div>
      <p>${payload.snippet}</p>
      <a href="${link}" target="_blank" rel="noreferrer">View card</a>
      ${
        notification.read_at
          ? ""
          : `<button data-id="${notification.id}" class="mark-read">Mark read</button>`
      }
    </li>
  `;
}

async function refreshNotifications() {
  const userId = Number(document.querySelector("#notifications-user-id").value);
  if (!userId) {
    return;
  }
  const { notifications } = await requestJson(`/notifications?user_id=${userId}`);
  const list = document.querySelector("#notification-list");
  list.innerHTML = notifications.map(notificationTemplate).join("");
  const unreadCount = notifications.filter((item) => !item.read_at).length;
  document.querySelector("#bell-count").textContent = unreadCount;
}

async function handleMarkRead(event) {
  if (!event.target.classList.contains("mark-read")) {
    return;
  }
  const id = event.target.dataset.id;
  await requestJson(`/notifications/${id}/read`, { method: "POST" });
  await refreshNotifications();
}

document.querySelector("#user-form").addEventListener("submit", createUser);
document.querySelector("#card-form").addEventListener("submit", createCard);
document.querySelector("#comment-form").addEventListener("submit", addComment);
document
  .querySelector("#refresh-notifications")
  .addEventListener("click", refreshNotifications);
document
  .querySelector("#notification-list")
  .addEventListener("click", handleMarkRead);

refreshNotifications();
