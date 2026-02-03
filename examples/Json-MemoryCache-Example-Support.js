require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { VoiceManager, JSONStorage, MemoryCache, XPCalculator } = require('discord-vc-tracker');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages]
});

// ---------- STORAGE & CACHE ----------
const storage = new JSONStorage('./data');      // JSON storage
const cache = new MemoryCache({ ttl: 300000, maxSize: 1000 }); // Optional caching
const calculator = new XPCalculator();

const voiceManager = new VoiceManager(client, {
  storage,
  cache, // Enable caching (comment out for no cache)
  checkInterval: 5000,
  debug: true,
  defaultConfig: {
    trackBots: false,
    trackAllChannels: true,
    enableLeveling: true,
    enableVoiceTime: true,
    xpStrategy: 'channel-bonus',
    voiceTimeStrategy: 'fixed',
    levelMultiplierStrategy: 'standard'
  }
});

// ---------- XP STRATEGY ----------
voiceManager.registerXPStrategy('channel-bonus', (member) => {
  const channel = member.voice.channel;
  if (!channel) return 10;
  if (channel.name.toLowerCase().includes('study')) return 20;
  if (channel.name.toLowerCase().includes('game')) return 15;
  return 10;
});

// ---------- COMMANDS ----------
const commands = [
  new SlashCommandBuilder().setName('stats').setDescription('View your voice stats'),
];

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'stats') {
    const user = await voiceManager.getUser(interaction.guildId, interaction.user.id);
    if (!user) return interaction.reply({ content: 'No data yet!', ephemeral: true });

    const multiplier = await voiceManager.guilds.get(interaction.guildId)?.config.getLevelMultiplier();
    const progress = calculator.calculateLevelProgress(user.xp, multiplier);
    const xpToNext = calculator.calculateXPToNextLevel(user.xp, multiplier);
    const rank = await user.getRank('xp');

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle(`${interaction.user.username}'s Stats`)
          .addFields(
            { name: 'Level', value: `${user.level}`, inline: true },
            { name: 'XP', value: `${user.xp}`, inline: true },
            { name: 'Progress', value: `${progress}% → Level ${user.level + 1}`, inline: true },
            { name: 'XP to Next', value: `${xpToNext}`, inline: true },
            { name: 'Rank', value: rank ? `#${rank}` : 'Unranked', inline: true }
          )
      ]
    });
  }
});

// ---------- READY ----------
client.once('ready', async () => {
  await voiceManager.init();
  await client.application.commands.set(commands);
  console.log(`✅ JSON bot ready as ${client.user.tag} (Cache ${cache ? 'enabled' : 'disabled'})`);
});

// ---------- ERROR HANDLING ----------
client.on('error', console.error);
process.on('unhandledRejection', console.error);

process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await voiceManager.destroy();
  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_BOT_TOKEN);
