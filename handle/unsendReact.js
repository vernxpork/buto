module.exports = function unsendReact(api, event) {
  if (event.type === "message_unsend") {
    api.sendMessage("Someone unsent a message 👀", event.threadID);
  }
};