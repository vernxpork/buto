module.exports = {
  name: "messageLogger",
  onEvent: async ({ api, event }) => {
    if (event.body) {
      console.log(`[${event.senderID}] ${event.body}`);
    }
  }
};