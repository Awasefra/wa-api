const { Client, MessageMedia, LocalAuth } = require("whatsapp-web.js");
const fs = require("fs");
const express = require("express");
const qrcode = require("qrcode");
const socketIO = require("socket.io");
const http = require("http");
require("dotenv").config();
const { phoneNumberFormatter } = require("./helpers/formatter");
const { body, validationResult } = require("express-validator");
const multer = require("multer");
const path = require("path");

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

  // Hanya kirim QR jika tidak ada sesi yang aktif
  if (!client.info) {
    client.on("qr", (qr) => {
      qrcode.toDataURL(qr, (err, url) => {
        socket.emit("qr", url);
        socket.emit(
          "message",
          `${new Date().toLocaleString()} QR Code received`
        );
      });
    });
  } else {
    socket.emit(
      "message",
      `${new Date().toLocaleString()} Already authenticated, no QR Code needed`
    );
  }

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

const checkRegisteredNumber = async function (number) {
  const isRegistered = await client.isRegisteredUser(number);
  return isRegistered;
};

// send message routing
app.post(
  "/send",
  [body("phone").notEmpty(), body("message").notEmpty()],
  async (req, res) => {
    const errors = validationResult(req).formatWith(({ msg }) => {
      return msg;
    });

    if (!errors.isEmpty()) {
      return res.status(422).json({
        status: false,
        message: errors.mapped(),
      });
    }
    const phone = phoneNumberFormatter(req.body.phone);
    const message = req.body.message;

    const isRegisteredNumber = await checkRegisteredNumber(phone);

    if (!isRegisteredNumber) {
      return res.status(422).json({
        status: false,
        message: "The number is not registered",
      });
    }

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
  }
);

const upload = multer({ dest: "uploads/" });

// Send media
app.post("/send-media", upload.single("file"), async (req, res) => {
  const phone = req.body.phone;
  const caption = req.body.message;
  const file = req.file;

  const extension = path.extname(file.originalname);
  const newFileName = `${file.filename}${extension}`;
  const newFilePath = path.join(file.destination, newFileName);

  try {
    fs.renameSync(file.path, newFilePath);
    // console.log("New File Path:", newFilePath);

    const formattedPhone = phoneNumberFormatter(phone);
    // console.log(formattedPhone);

    const media = MessageMedia.fromFilePath(newFilePath);
    // console.log("Sending media:", media);

    await client.sendMessage(formattedPhone, media, { caption: caption });

    res.json({ message: "Media sent successfully" });
  } catch (error) {
    console.error("Error details:", error);
    res.status(500).json({ error: "Failed to send media: " + error.message });
  } finally {
    // Delete the file after sending or even if there's an error
    try {
      if (fs.existsSync(newFilePath)) {
        fs.unlinkSync(newFilePath);
        console.log("File deleted:", newFilePath);
      }
    } catch (unlinkError) {
      console.error("Failed to delete file:", unlinkError);
    }
  }
});

server.listen(port, () => {
  console.log("App listen on port ", port);
});
