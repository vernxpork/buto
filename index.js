const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const wiegine = require("ws3-fca");
const fs = require("fs");
const autoReact = require("./handle/autoReact");
const unsendReact = require("./handle/unsendReact");
const chalk = require("chalk");

const app = express();
const PORT = process.env.PORT || 3000;
const configPath = path.join(__dirname, "config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

app.use(bodyParser.json());
app.use(express.static("public"));

global.NashBoT = {
  commands: new Map(),
  events: new Map(),
  onlineUsers: new Map(),
  cooldowns: new Map(),
};

global.NashBot = {
  REVN: "https://kaiz-apis.gleeze.com/"
};

let isLoggedIn = false;
let loginAttempts = 0;
const nax_retries = 5;
const interval = 5000;

const loadModules = (type) => {
  const folderPath = path.join(__dirname, "modules", type);
  const files = fs.readdirSync(folderPath).filter(file => file.endsWith(".js"));

  console.log(chalk.bold.redBright(`──LOADING ${type.toUpperCase()}──●`));

  files.forEach(file => {
    const module = require(path.join(folderPath, file));
    if (module && module.name && module[type === "commands" ? "execute" : "onEvent"]) {
      module.nashPrefix = module.nashPrefix !== undefined ? module.nashPrefix : true;
      module.cooldowns = module.cooldowns || 0;
      global.NashBoT[type].set(module.name, module);

      if (type === "commands" && module.aliases && Array.isArray(module.aliases)) {
        module.aliases.forEach(alias => {
          global.NashBoT[type].set(alias, module);
        });
      }

      console.log(
        chalk.bold.gray("[") + 
        chalk.bold.cyan("INFO") + 
        chalk.bold.gray("] ") + 
        chalk.bold.green(`Loaded ${type.slice(0, -1)}: `) + 
        chalk.bold.magenta(module.name)
      );
    }
  });
};

const relogin = async () => {
  if (isLoggedIn) return;

  const appStatePath = path.join(__dirname, "appstate.json");
  if (fs.existsSync(appStatePath)) {
    try {
      const appState = JSON.parse(fs.readFileSync(appStatePath, "utf8"));

      const loginTimeout = setTimeout(() => {
        console.error(
          chalk.bold.gray("[") + 
          chalk.bold.red("TIMEOUT") + 
          chalk.bold.gray("] ") + 
          chalk.bold.redBright("Login timeout - retrying...")
        );
        retryLogin();
      }, 30000); 

      wiegine.login(appState, {}, (err, api) => {
        clearTimeout(loginTimeout);

        if (err) {
          console.error(
            chalk.bold.gray("[") + 
            chalk.bold.red("ERROR") + 
            chalk.bold.gray("] ") + 
            chalk.bold.redBright("Failed to auto-login:", err.message)
          );
          retryLogin();
          return;
        }
        const cuid = api.getCurrentUserID();
        global.NashBoT.onlineUsers.set(cuid, { userID: cuid, prefix: config.prefix });
        setupBot(api, config.prefix);
        isLoggedIn = true;
        loginAttempts = 0;
      });
    } catch (error) {
      console.error(
        chalk.bold.gray("[") + 
        chalk.bold.red("ERROR") + 
        chalk.bold.gray("] ") + 
        chalk.bold.redBright("Invalid appstate.json:", error.message)
      );
      retryLogin();
    }
  } else {
    console.error(
      chalk.bold.gray("[") + 
      chalk.bold.red("ERROR") + 
      chalk.bold.gray("] ") + 
      chalk.bold.redBright("appstate.json not found")
    );
  }
};

const retryLogin = () => {
  if (loginAttempts >= nax_retries) {
    console.error(
      chalk.bold.gray("[") + 
      chalk.bold.red("ERROR") + 
      chalk.bold.gray("] ") + 
      chalk.bold.redBright("Max login attempts reached. Please check your appstate file.")
    );
    return;
  }

  loginAttempts++;
  console.log(
    chalk.bold.gray("[") + 
    chalk.bold.yellow("RETRY") + 
    chalk.bold.gray("] ") + 
    chalk.bold.yellowBright(`Retrying login attempt ${loginAttempts} of ${nax_retries}...`)
  );

  setTimeout(relogin, interval);
};

const setupBot = (api, prefix) => {
  api.setOptions({
    forceLogin: false,
    selfListen: false,
    autoReconnect: false,
    listenEvents: true,
    logLevel: "silent",
    updatePresence: false,
    online: false,
    userAgent: "Mozilla/5.0"
  });

  api.listenMqtt((err, event) => {
    if (err) {
      console.error(
        chalk.bold.gray("[") + 
        chalk.bold.red("ERROR") + 
        chalk.bold.gray("] ") + 
        chalk.bold.redBright("Connection error detected, attempting relogin...")
      );
      isLoggedIn = false;
      retryLogin();
      return;
    }

    handleMessage(api, event, prefix);
    handleEvent(api, event, prefix);
    autoReact(api, event);
    unsendReact(api, event);
  });

  setInterval(() => {
    api.getFriendsList(() => console.log(
      chalk.bold.gray("[") + 
      chalk.bold.cyan("INFO") + 
      chalk.bold.gray("] ") + 
      chalk.bold.green("Keep-alive signal sent")
    ));
  }, 1000 * 60 * 45);
};

const handleEvent = async (api, event, prefix) => {
  const { events } = global.NashBoT;
  try {
    for (const { onEvent } of events.values()) {
      await onEvent({ prefix, api, event });
    }
  } catch (err) {
    console.error("Event error:", err);
  }
};

const handleMessage = async (api, event, prefix) => {
  if (!event.body) return;

  await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));

  let [command, ...args] = event.body.trim().split(" ");
  if (command.startsWith(prefix)) command = command.slice(prefix.length);

  const cmdFile = global.NashBoT.commands.get(command.toLowerCase());
  if (cmdFile) {
    if (cmdFile.role === "admin" && event.senderID !== config.adminUID) {
      return api.sendMessage("You don't have permission to use this command.", event.threadID);
    }

    try {
      await cmdFile.execute(api, event, args, prefix);
    } catch (err) {
      api.sendMessage("Command error: " + err.message, event.threadID);
    }
  }
};

const init = async () => {
  await loadModules("commands");
  await loadModules("events");
  await relogin();
  console.log(chalk.bold.blueBright("──STARTING BOT──●"));
};

init().then(() => app.listen(PORT, '0.0.0.0', () => console.log(
  chalk.bold.greenBright(`Running on http://0.0.0.0:${PORT}`)
)));