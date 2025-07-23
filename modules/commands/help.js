module.exports = {
  name: "help",
  description: "List available commands",
  aliases: ["h"],
  cooldowns: 3,
  role: "user",
  execute: async (api, event, args, prefix) => {
    const message = `
🔧 Available Commands:
• ${prefix}help - Show this message
More commands coming soon!
    `.trim();
    api.sendMessage(message, event.threadID);
  }
};