const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// public フォルダをそのまま配信する
app.use(express.static(path.join(__dirname, "public")));

// 接続確認
io.on("connection", (socket) => {
  console.log("ユーザー接続:", socket.id);

  socket.emit("serverMessage", "サーバーとの接続に成功しました");

  socket.on("disconnect", () => {
    console.log("ユーザー切断:", socket.id);
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});