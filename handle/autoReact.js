module.exports = function autoReact(api, event) {
  if (event.type === "message" && event.senderID !== api.getCurrentUserID()) {
    api.setMessageReaction("❤️", event.messageID, (err) => {}, true);
  }
};