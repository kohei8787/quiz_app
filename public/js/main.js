const socket = io();

const statusEl = document.getElementById("status");

socket.on("connect", () => {
  statusEl.textContent = "サーバーに接続しました";
});

socket.on("serverMessage", (message) => {
  statusEl.textContent = message;
});