const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = Number(process.env.PORT || 10000);
const HOST = "0.0.0.0";

app.use(express.json());
app.use(express.static(__dirname));

app.get("/api/status", (req, res) => {
  res.json({
    status: "running",
    message: "Dashboard server is running"
  });
});

io.on("connection", (socket) => {
  console.log("Dashboard client connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("Dashboard client disconnected:", socket.id);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Server running on port ${PORT}`);
});
