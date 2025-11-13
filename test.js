// ==================== monitor-bot.js (Bot 1: Monitors Servers) ====================
const { Client } = require("discord.js-selfbot-v13");
const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");
require("dotenv").config();

const colors = {
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  reset: "\x1b[0m",
  bright: "\x1b[1m",
};

class MonitorBot {
  constructor(config) {
    this.token = config.token;
    this.senderBotUrl = config.senderBotUrl;
    this.port = config.port;
    this.botName = config.botName || "Monitor Bot";
    this.dataFile = path.join(
      __dirname,
      `monitored_servers_${this.botName}.json`
    );
    this.monitoredServers = new Set();
    this.client = new Client();
    this.app = express();

    this.setupExpress();
    this.setupEventHandlers();
  }

  setupExpress() {
    this.app.get("/", (req, res) => {
      res.json({
        status: `${this.botName} is running`,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        botReady: this.client.isReady(),
        monitoredServers: this.monitoredServers.size,
      });
    });

    this.app.listen(this.port, () => {
      console.log(`[${this.botName}] Web server running on port ${this.port}`);
    });
  }

  async loadMonitoredServers() {
    try {
      const data = await fs.readFile(this.dataFile, "utf8");
      const servers = JSON.parse(data);
      this.monitoredServers = new Set(servers);
      console.log(
        `[${this.botName}] ✅ Loaded ${this.monitoredServers.size} monitored servers`
      );
      return true;
    } catch (error) {
      if (error.code === "ENOENT") {
        this.monitoredServers = new Set();
        await this.saveMonitoredServers();
        console.log(`[${this.botName}] 📝 Created new monitored servers file`);
        return true;
      } else {
        console.error(
          `[${this.botName}] ❌ Error loading monitored servers:`,
          error
        );
        return false;
      }
    }
  }

  async saveMonitoredServers() {
    try {
      const serversArray = Array.from(this.monitoredServers);
      await fs.writeFile(this.dataFile, JSON.stringify(serversArray, null, 2));
      console.log(
        `[${this.botName}] 💾 Saved ${serversArray.length} monitored servers`
      );
    } catch (error) {
      console.error(
        `[${this.botName}] ❌ Error saving monitored servers:`,
        error
      );
    }
  }

  async addAllServersToMonitoring() {
    console.log(`[${this.botName}] 🔍 Adding all servers to monitoring...`);
    console.log(
      `[${this.botName}] 📊 Total servers: ${this.client.guilds.cache.size}`
    );

    if (this.client.guilds.cache.size === 0) {
      console.log(`[${this.botName}] ⚠️ WARNING: No guilds found in cache!`);
      return;
    }

    this.monitoredServers.clear();

    let processedCount = 0;
    for (const [guildId, guild] of this.client.guilds.cache) {
      console.log(
        `[${this.botName}] Processing ${++processedCount}/${
          this.client.guilds.cache.size
        }: ${guild.name}`
      );
      this.monitoredServers.add(guild.id);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    await this.saveMonitoredServers();
    console.log(
      `[${this.botName}] 🎯 Setup complete! Monitoring ${this.monitoredServers.size} servers`
    );
  }

  async notifySenderBot(memberData) {
    try {
      await axios.post(`${this.senderBotUrl}/send-notification`, memberData, {
        timeout: 5000,
        headers: { "Content-Type": "application/json" },
      });
      console.log(`[${this.botName}] ✅ Sent notification to Sender Bot`);
      return true;
    } catch (error) {
      console.error(
        `[${this.botName}] ❌ Failed to notify Sender Bot:`,
        error.message
      );
      return false;
    }
  }

  setupEventHandlers() {
    this.client.on("ready", async () => {
      console.log("=".repeat(50));
      console.log(
        `[${this.botName}] ${colors.green}✅ Bot logged in!${colors.reset}`
      );
      console.log(
        `[${this.botName}] ${colors.green}👤 ${this.client.user.username}${colors.reset}`
      );
      console.log(
        `[${this.botName}] ${colors.cyan}🔗 Sender Bot URL: ${this.senderBotUrl}${colors.reset}`
      );
      console.log("=".repeat(50));

      await this.loadMonitoredServers();
      console.log(`[${this.botName}] ⏳ Waiting 5 seconds for cache...`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      await this.addAllServersToMonitoring();
      console.log(`[${this.botName}] ✅ Bot fully operational!`);
    });

    this.client.on("error", (error) => {
      console.error(`[${this.botName}] ❌ Error:`, error);
    });

    this.client.on("guildMemberAdd", async (member) => {
      if (!this.monitoredServers.has(member.guild.id)) return;

      const now = new Date();
      const date = now.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const time = now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      const memberData = {
        username: member.user.username,
        userId: member.user.id,
        guildName: member.guild.name,
        guildId: member.guild.id,
        date: date,
        time: time,
        timestamp: now.toISOString(),
        source: this.botName,
      };

      console.log(
        `[${this.botName}] 🆕 New member detected: ${member.user.username} in ${member.guild.name}`
      );
      await this.notifySenderBot(memberData);
    });

    this.client.on("guildCreate", async (guild) => {
      console.log(`[${this.botName}] Joined: ${guild.name}`);
      this.monitoredServers.add(guild.id);
      await this.saveMonitoredServers();
    });

    this.client.on("guildDelete", async (guild) => {
      if (this.monitoredServers.has(guild.id)) {
        this.monitoredServers.delete(guild.id);
        await this.saveMonitoredServers();
        console.log(`[${this.botName}] Left: ${guild.name}`);
      }
    });
  }

  async start() {
    console.log(`[${this.botName}] 🚀 Attempting to log in...`);
    try {
      await this.client.login(this.token);
    } catch (error) {
      console.error(`[${this.botName}] ❌ FATAL: Login failed:`, error);
      throw error;
    }
  }
}

// ==================== sender-bot.js (Bot 2: Sends DMs + Monitors Own Servers) ====================

class SenderBot {
  constructor(config) {
    this.token = config.token;
    this.targetUserId = config.targetUserId;
    this.port = config.port;
    this.botName = config.botName || "Sender Bot";
    this.dataFile = path.join(
      __dirname,
      `monitored_servers_${this.botName}.json`
    );
    this.monitoredServers = new Set();
    this.client = new Client();
    this.app = express();
    this.pendingNotifications = [];

    this.setupExpress();
    this.setupEventHandlers();
  }

  setupExpress() {
    this.app.use(express.json());

    this.app.get("/", (req, res) => {
      res.json({
        status: `${this.botName} is running`,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        botReady: this.client.isReady(),
        pendingNotifications: this.pendingNotifications.length,
        monitoredServers: this.monitoredServers.size,
      });
    });

    // Endpoint to receive notifications from Monitor Bot
    this.app.post("/send-notification", async (req, res) => {
      const memberData = req.body;
      console.log(
        `[${this.botName}] 📬 Received notification from ${
          memberData.source || "Monitor Bot"
        }: ${memberData.username}`
      );

      if (!this.client.isReady()) {
        this.pendingNotifications.push(memberData);
        console.log(`[${this.botName}] ⏳ Bot not ready, queued notification`);
        return res.json({
          status: "queued",
          message: "Bot not ready, notification queued",
        });
      }

      const result = await this.sendNotification(memberData);
      res.json(result);
    });

    this.app.listen(this.port, () => {
      console.log(`[${this.botName}] Web server running on port ${this.port}`);
    });
  }

  async loadMonitoredServers() {
    try {
      const data = await fs.readFile(this.dataFile, "utf8");
      const servers = JSON.parse(data);
      this.monitoredServers = new Set(servers);
      console.log(
        `[${this.botName}] ✅ Loaded ${this.monitoredServers.size} monitored servers`
      );
      return true;
    } catch (error) {
      if (error.code === "ENOENT") {
        this.monitoredServers = new Set();
        await this.saveMonitoredServers();
        console.log(`[${this.botName}] 📝 Created new monitored servers file`);
        return true;
      } else {
        console.error(
          `[${this.botName}] ❌ Error loading monitored servers:`,
          error
        );
        return false;
      }
    }
  }

  async saveMonitoredServers() {
    try {
      const serversArray = Array.from(this.monitoredServers);
      await fs.writeFile(this.dataFile, JSON.stringify(serversArray, null, 2));
      console.log(
        `[${this.botName}] 💾 Saved ${serversArray.length} monitored servers`
      );
    } catch (error) {
      console.error(
        `[${this.botName}] ❌ Error saving monitored servers:`,
        error
      );
    }
  }

  async addAllServersToMonitoring() {
    console.log(`[${this.botName}] 🔍 Adding all servers to monitoring...`);
    console.log(
      `[${this.botName}] 📊 Total servers: ${this.client.guilds.cache.size}`
    );

    if (this.client.guilds.cache.size === 0) {
      console.log(`[${this.botName}] ⚠️ WARNING: No guilds found in cache!`);
      return;
    }

    this.monitoredServers.clear();

    let processedCount = 0;
    for (const [guildId, guild] of this.client.guilds.cache) {
      console.log(
        `[${this.botName}] Processing ${++processedCount}/${
          this.client.guilds.cache.size
        }: ${guild.name}`
      );
      this.monitoredServers.add(guild.id);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    await this.saveMonitoredServers();
    console.log(
      `[${this.botName}] 🎯 Setup complete! Monitoring ${this.monitoredServers.size} servers`
    );
  }

  async sendNotification(memberData) {
    try {
      const targetUser = await this.client.users.fetch(this.targetUserId);
      const source = memberData.source || "Monitor Bot";
      const message = `🎉 **New Member Alert!** [${source}]\n📆 ${memberData.date}\n🕐 ${memberData.time}\n👤 \`${memberData.username}\`\n🆔 \`${memberData.userId}\`\n🏠 ${memberData.guildName}`;

      await targetUser.send(message);

      console.log(
        `[${this.botName}] ✅ Sent DM to ${targetUser.username} for: ${memberData.username} from ${memberData.guildName} (Source: ${source})`
      );
      return { status: "success", message: "Notification sent" };
    } catch (err) {
      console.error(`[${this.botName}] ❌ Failed to send DM:`, err);
      return { status: "error", message: err.message };
    }
  }

  async processPendingNotifications() {
    if (this.pendingNotifications.length === 0) return;

    console.log(
      `[${this.botName}] 📤 Processing ${this.pendingNotifications.length} pending notifications...`
    );

    while (this.pendingNotifications.length > 0) {
      const notification = this.pendingNotifications.shift();
      await this.sendNotification(notification);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  setupEventHandlers() {
    this.client.on("ready", async () => {
      console.log("=".repeat(50));
      console.log(
        `[${this.botName}] ${colors.green}✅ Bot logged in!${colors.reset}`
      );
      console.log(
        `[${this.botName}] ${colors.green}👤 ${this.client.user.username}${colors.reset}`
      );
      console.log(
        `[${this.botName}] ${colors.cyan}🎯 Target User ID: ${this.targetUserId}${colors.reset}`
      );
      console.log("=".repeat(50));

      await this.loadMonitoredServers();
      console.log(`[${this.botName}] ⏳ Waiting 5 seconds for cache...`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      await this.addAllServersToMonitoring();
      console.log(
        `[${this.botName}] ✅ Ready to send DM notifications and monitor servers!`
      );

      await this.processPendingNotifications();
    });

    this.client.on("error", (error) => {
      console.error(`[${this.botName}] ❌ Error:`, error);
    });

    // Monitor for new members in Sender Bot's own servers
    this.client.on("guildMemberAdd", async (member) => {
      if (!this.monitoredServers.has(member.guild.id)) return;

      const now = new Date();
      const date = now.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const time = now.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      const memberData = {
        username: member.user.username,
        userId: member.user.id,
        guildName: member.guild.name,
        guildId: member.guild.id,
        date: date,
        time: time,
        timestamp: now.toISOString(),
        source: this.botName,
      };

      console.log(
        `[${this.botName}] 🆕 New member detected in own server: ${member.user.username} in ${member.guild.name}`
      );
      await this.sendNotification(memberData);
    });

    this.client.on("guildCreate", async (guild) => {
      console.log(`[${this.botName}] Joined: ${guild.name}`);
      this.monitoredServers.add(guild.id);
      await this.saveMonitoredServers();
    });

    this.client.on("guildDelete", async (guild) => {
      if (this.monitoredServers.has(guild.id)) {
        this.monitoredServers.delete(guild.id);
        await this.saveMonitoredServers();
        console.log(`[${this.botName}] Left: ${guild.name}`);
      }
    });
  }

  async start() {
    console.log(`[${this.botName}] 🚀 Attempting to log in...`);
    try {
      await this.client.login(this.token);
    } catch (error) {
      console.error(`[${this.botName}] ❌ FATAL: Login failed:`, error);
      throw error;
    }
  }
}

// ==================== index.js (Main Entry Point) ====================

async function main() {
  // Configuration
  const config = {
    monitorBot: {
      token: process.env.MONITOR_TOKEN,
      senderBotUrl: "http://localhost:3007",
      port: 3000,
      botName: "Monitor",
    },
    senderBot: {
      token: process.env.SENDER_TOKEN,
      targetUserId: "1407682357611204671",
      port: 3007,
      botName: "Sender",
    },
  };

  console.log("🚀 Starting Two-Bot System with Dual Monitoring...\n");

  // Start Sender Bot first
  const senderBot = new SenderBot(config.senderBot);
  await senderBot.start();

  // Wait for Sender Bot to fully initialize
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Start Monitor Bot
  const monitorBot = new MonitorBot(config.monitorBot);
  await monitorBot.start();

  console.log("\n✅ Both bots are now running!");
  console.log(`📊 Monitor Bot: http://localhost:${config.monitorBot.port}`);
  console.log(`📊 Sender Bot: http://localhost:${config.senderBot.port}`);
  console.log("\n📋 Summary:");
  console.log(`   • Monitor Bot monitors its servers and sends to Sender Bot`);
  console.log(
    `   • Sender Bot monitors its own servers AND receives from Monitor Bot`
  );
  console.log(
    `   • All notifications are sent to User ID: ${config.senderBot.targetUserId}`
  );
}

// Export classes for modular use
module.exports = { MonitorBot, SenderBot };

// Run if this is the main module
if (require.main === module) {
  main().catch(console.error);
}
