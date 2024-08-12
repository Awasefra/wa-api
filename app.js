const { Client, LocalAuth } = require("whatsapp-web.js");
const fs = require("fs");
const express = require("express");
const qrcode = require("qrcode");
const socketIO = require("socket.io");
const http = require("http");
require("dotenv").config();
const { phoneNumberFormatter } = require('./helpers/formatter');

const port = process.env.PORT;

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  })
);

const client = new Client({
  restartOnAuthFail: true,
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--single-process", // <- this one doesn't works in Windows
      "--disable-gpu",
    ],
  },
  authStrategy: new LocalAuth(),
});

// index routing and middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.get("/", (req, res) => {
  res.sendFile("index.html", { root: __dirname });
});

// initialize whatsapp and the example event
client.on("message", (msg) => {
  if (msg.body == "!bro") {
    msg.reply("okeyyyy");
  } else if (msg.body == "skuy") {
    msg.reply("helo ma bradah");
  }
});
client.initialize();

// socket connection
var today = new Date();
var now = today.toLocaleString();
io.on("connection", (socket) => {
  socket.emit("message", `${now} Connected`);

  client.on("qr", (qr) => {
    qrcode.toDataURL(qr, (err, url) => {
      socket.emit("qr", url);
      socket.emit("message", `${now} QR Code received`);
    });
  });

  client.on("ready", () => {
    socket.emit("message", `${now} WhatsApp is ready!`);
  });

  client.on("authenticated", () => {
    socket.emit("message", `${now} Whatsapp is authenticated!`);
  });

  client.on("auth_failure", function (session) {
    socket.emit("message", `${now} Auth failure, restarting...`);
  });

  client.on("disconnected", function () {
    socket.emit("message", `${now} Disconnected`);
    client.destroy();
    client.initialize();
  });
});

// send message routing
app.post("/send", (req, res) => {
  const phone = phoneNumberFormatter(req.body.phone);
  const message = req.body.message;

  client
    .sendMessage(phone, message)
    .then((response) => {
      res.status(200).json({
        error: false,
        data: {
          message: "Pesan terkirim",
          meta: response,
        },
      });
    })
    .catch((error) => {
      res.status(200).json({
        error: true,
        data: {
          message: "Error send message",
          meta: error.message,
        },
      });
    });
});

server.listen(port, () => {
  console.log("App listen on port ", port);
});
