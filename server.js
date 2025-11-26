// ==================== Unified Bot with Self-Ping (Railway) ====================
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

class UnifiedBot {
  constructor() {
    this.monitorToken = process.env.MONITOR_TOKEN;
    this.senderToken = process.env.SENDER_TOKEN;
    this.targetUserId = process.env.TARGET_USER_ID || "1407682357611204671";
    this.port = process.env.PORT || 3000;

    // Railway provides PUBLIC_DOMAIN or RAILWAY_PUBLIC_DOMAIN
    // Also supports custom RAILWAY_STATIC_URL for static deployments
    this.railwayUrl = process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : process.env.PUBLIC_DOMAIN
      ? `https://${process.env.PUBLIC_DOMAIN}`
      : process.env.RAILWAY_STATIC_URL
      ? process.env.RAILWAY_STATIC_URL
      : null;

    this.monitorClient = new Client();
    this.senderClient = new Client();

    this.monitorServers = new Set();
    this.senderServers = new Set();

    this.monitorDataFile = path.join(
      __dirname,
      "monitored_servers_monitor.json"
    );
    this.senderDataFile = path.join(__dirname, "monitored_servers_sender.json");

    this.app = express();

    this.setupExpress();
  }

  setupExpress() {
    this.app.use(express.json());

    this.app.get("/", (req, res) => {
      res.json({
        status: "Unified Discord Bot is running",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        environment: process.env.RAILWAY_ENVIRONMENT || "unknown",
        monitorBot: {
          ready: this.monitorClient.isReady(),
          username: this.monitorClient.user?.username,
          servers: this.monitorServers.size,
        },
        senderBot: {
          ready: this.senderClient.isReady(),
          username: this.senderClient.user?.username,
          servers: this.senderServers.size,
        },
      });
    });

    this.app.get("/health", (req, res) => {
      res.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      });
    });

    this.app.listen(this.port, "0.0.0.0", () => {
      console.log(`[UNIFIED BOT] 🌐 Web server running on port ${this.port}`);
      console.log(
        `[UNIFIED BOT] 🚂 Railway URL: ${
          this.railwayUrl || "Not available (local mode)"
        }`
      );
    });
  }

  async loadMonitoredServers() {
    try {
      // Load Monitor bot servers
      const monitorData = await fs.readFile(this.monitorDataFile, "utf8");
      this.monitorServers = new Set(JSON.parse(monitorData));
      console.log(
        `[MONITOR] ✅ Loaded ${this.monitorServers.size} monitored servers`
      );
    } catch (error) {
      if (error.code === "ENOENT") {
        this.monitorServers = new Set();
        await this.saveMonitoredServers();
        console.log(`[MONITOR] 📝 Created new monitored servers file`);
      } else {
        console.error(`[MONITOR] ❌ Error loading servers:`, error);
      }
    }

    try {
      // Load Sender bot servers
      const senderData = await fs.readFile(this.senderDataFile, "utf8");
      this.senderServers = new Set(JSON.parse(senderData));
      console.log(
        `[SENDER] ✅ Loaded ${this.senderServers.size} monitored servers`
      );
    } catch (error) {
      if (error.code === "ENOENT") {
        this.senderServers = new Set();
        await this.saveSenderServers();
        console.log(`[SENDER] 📝 Created new monitored servers file`);
      } else {
        console.error(`[SENDER] ❌ Error loading servers:`, error);
      }
    }
  }

  async saveMonitoredServers() {
    try {
      const serversArray = Array.from(this.monitorServers);
      await fs.writeFile(
        this.monitorDataFile,
        JSON.stringify(serversArray, null, 2)
      );
    } catch (error) {
      console.error(`[MONITOR] ❌ Error saving servers:`, error);
    }
  }

  async saveSenderServers() {
    try {
      const serversArray = Array.from(this.senderServers);
      await fs.writeFile(
        this.senderDataFile,
        JSON.stringify(serversArray, null, 2)
      );
    } catch (error) {
      console.error(`[SENDER] ❌ Error saving servers:`, error);
    }
  }

  async addAllServersToMonitoring() {
    // Add Monitor bot servers
    console.log(`[MONITOR] 🔍 Adding all servers to monitoring...`);
    if (this.monitorClient.guilds.cache.size > 0) {
      this.monitorServers.clear();
      let count = 0;
      for (const [guildId, guild] of this.monitorClient.guilds.cache) {
        this.monitorServers.add(guild.id);
        console.log(`[MONITOR] Processing ${++count}: ${guild.name}`);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      await this.saveMonitoredServers();
      console.log(
        `[MONITOR] 🎯 Monitoring ${this.monitorServers.size} servers`
      );
    }

    // Add Sender bot servers
    console.log(`[SENDER] 🔍 Adding all servers to monitoring...`);
    if (this.senderClient.guilds.cache.size > 0) {
      this.senderServers.clear();
      let count = 0;
      for (const [guildId, guild] of this.senderClient.guilds.cache) {
        this.senderServers.add(guild.id);
        console.log(`[SENDER] Processing ${++count}: ${guild.name}`);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      await this.saveSenderServers();
      console.log(`[SENDER] 🎯 Monitoring ${this.senderServers.size} servers`);
    }
  }

  async sendNotification(memberData) {
    try {
      const targetUser = await this.senderClient.users.fetch(this.targetUserId);
      const source = memberData.source || "Monitor Bot";
      const message = `🎉 **New Member Alert!** [${source}]\n📆 ${memberData.date}\n🕐 ${memberData.time}\n👤 \`${memberData.username}\`\n🆔 \`${memberData.userId}\`\n🏠 ${memberData.guildName}`;

      await targetUser.send(message);

      console.log(
        `[SENDER] ✅ Sent DM to ${targetUser.username} for: ${memberData.username} from ${memberData.guildName}`
      );
      return true;
    } catch (err) {
      console.error(`[SENDER] ❌ Failed to send DM:`, err);
      return false;
    }
  }

  setupMonitorBotHandlers() {
    this.monitorClient.on("ready", async () => {
      console.log("=".repeat(50));
      console.log(`[MONITOR] ${colors.green}✅ Bot logged in!${colors.reset}`);
      console.log(
        `[MONITOR] ${colors.green}👤 ${this.monitorClient.user.username}${colors.reset}`
      );
      console.log("=".repeat(50));
    });

    this.monitorClient.on("error", (error) => {
      console.error(`[MONITOR] ❌ Error:`, error);
    });

    this.monitorClient.on("guildMemberAdd", async (member) => {
      if (!this.monitorServers.has(member.guild.id)) return;

      const now = new Date();
      const memberData = {
        username: member.user.username,
        userId: member.user.id,
        guildName: member.guild.name,
        guildId: member.guild.id,
        date: now.toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
        time: now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        timestamp: now.toISOString(),
        source: "Monitor Bot",
      };

      console.log(
        `[MONITOR] 🆕 New member: ${member.user.username} in ${member.guild.name}`
      );
      await this.sendNotification(memberData);
    });

    this.monitorClient.on("guildCreate", async (guild) => {
      console.log(`[MONITOR] Joined: ${guild.name}`);
      this.monitorServers.add(guild.id);
      await this.saveMonitoredServers();
    });

    this.monitorClient.on("guildDelete", async (guild) => {
      if (this.monitorServers.has(guild.id)) {
        this.monitorServers.delete(guild.id);
        await this.saveMonitoredServers();
        console.log(`[MONITOR] Left: ${guild.name}`);
      }
    });
  }

  setupSenderBotHandlers() {
    this.senderClient.on("ready", async () => {
      console.log("=".repeat(50));
      console.log(`[SENDER] ${colors.green}✅ Bot logged in!${colors.reset}`);
      console.log(
        `[SENDER] ${colors.green}👤 ${this.senderClient.user.username}${colors.reset}`
      );
      console.log(
        `[SENDER] ${colors.cyan}🎯 Target User ID: ${this.targetUserId}${colors.reset}`
      );
      console.log("=".repeat(50));
    });

    this.senderClient.on("error", (error) => {
      console.error(`[SENDER] ❌ Error:`, error);
    });

    this.senderClient.on("guildMemberAdd", async (member) => {
      if (!this.senderServers.has(member.guild.id)) return;

      const now = new Date();
      const memberData = {
        username: member.user.username,
        userId: member.user.id,
        guildName: member.guild.name,
        guildId: member.guild.id,
        date: now.toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
        time: now.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        timestamp: now.toISOString(),
        source: "Sender Bot",
      };

      console.log(
        `[SENDER] 🆕 New member in own server: ${member.user.username} in ${member.guild.name}`
      );
      await this.sendNotification(memberData);
    });

    this.senderClient.on("guildCreate", async (guild) => {
      console.log(`[SENDER] Joined: ${guild.name}`);
      this.senderServers.add(guild.id);
      await this.saveSenderServers();
    });

    this.senderClient.on("guildDelete", async (guild) => {
      if (this.senderServers.has(guild.id)) {
        this.senderServers.delete(guild.id);
        await this.saveSenderServers();
        console.log(`[SENDER] Left: ${guild.name}`);
      }
    });
  }

  async start() {
    console.log("🚀 Starting Unified Bot System on Railway...\n");

    // Setup event handlers
    this.setupMonitorBotHandlers();
    this.setupSenderBotHandlers();

    // Login both bots
    try {
      console.log("[SENDER] 🔐 Logging in Sender Bot...");
      await this.senderClient.login(this.senderToken);
      console.log("[SENDER] ✅ Logged in successfully!");

      await new Promise((resolve) => setTimeout(resolve, 2000));

      console.log("[MONITOR] 🔐 Logging in Monitor Bot...");
      await this.monitorClient.login(this.monitorToken);
      console.log("[MONITOR] ✅ Logged in successfully!");

      // Wait for caches to populate
      console.log("⏳ Waiting for guild caches to populate...");
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Load and setup servers
      await this.loadMonitoredServers();
      await this.addAllServersToMonitoring();

      console.log("\n" + "=".repeat(50));
      console.log("✅ UNIFIED BOT SYSTEM FULLY OPERATIONAL!");
      console.log("=".repeat(50));
      console.log(`📊 Monitor Bot: ${this.monitorServers.size} servers`);
      console.log(`📊 Sender Bot: ${this.senderServers.size} servers`);
      console.log(`🎯 Target User ID: ${this.targetUserId}`);
      console.log(
        `🚂 Railway Environment: ${process.env.RAILWAY_ENVIRONMENT || "local"}`
      );
      console.log(`🌐 Public URL: ${this.railwayUrl || "localhost"}`);
      console.log("=".repeat(50));
    } catch (error) {
      console.error("❌ FATAL: Failed to start bot:", error);
      throw error;
    }
  }

  // Graceful shutdown handler
}

// ==================== Main Entry Point ====================
async function main() {
  const bot = new UnifiedBot();
  await bot.start();

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n🛑 Shutting down gracefully...");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\n🛑 Shutting down gracefully...");
    process.exit(0);
  });
}

// Export for modular use
module.exports = { UnifiedBot };

// Run if this is the main module
if (require.main === module) {
  main().catch(console.error);
}
