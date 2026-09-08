// ============================================================
// BOT DISCORD OFFICIEL - LES Z'ÉLÉPHANTS PARAPENTE
// Commandes /covoit, !covoit, boutons [Je monte] & [Se désister]
// ============================================================
require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder,
  SlashCommandBuilder,
  REST,
  Routes
} = require('discord.js');

if (!process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN.includes('COLLEZ_VOTRE_TOKEN')) {
  console.error("❌ ERREUR : Le token du bot n'est pas configuré dans le fichier .env !");
  console.error("Ouvrez le fichier .env avec le Bloc-notes et collez votre token secret Discord.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Enregistrement des commandes /covoit et /sortie
const commands = [
  new SlashCommandBuilder()
    .setName('covoit')
    .setDescription('Organiser une navette / covoiturage pour un site')
    .addStringOption(opt => opt.setName('destination').setDescription('Site de vol (ex: Verel, Sire, Chamoux)').setRequired(true))
    .addStringOption(opt => opt.setName('heure').setDescription('Heure de départ (ex: 14h00)').setRequired(true))
    .addIntegerOption(opt => opt.setName('places').setDescription('Nombre de places disponibles').setRequired(true))
    .addStringOption(opt => opt.setName('rdv').setDescription('Lieu de rendez-vous (ex: Atterrissage Verel)').setRequired(false)),
  new SlashCommandBuilder()
    .setName('sortie')
    .setDescription('Proposer une sortie club / cross / rando-vol')
    .addStringOption(opt => opt.setName('titre').setDescription('Nom de la sortie').setRequired(true))
    .addStringOption(opt => opt.setName('date').setDescription('Date et heure (ex: Samedi 14 Juin 09h00)').setRequired(true))
    .addIntegerOption(opt => opt.setName('max').setDescription('Nombre max de pilotes').setRequired(false))
];

client.once('ready', async () => {
  console.log(`✅ Bot Z'éléphants connecté avec succès en tant que ${client.user.tag} !`);
  
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
  try {
    console.log('🔄 Enregistrement des commandes slash /covoit et /sortie auprès de Discord...');
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    console.log('🚀 Commandes /covoit et /sortie activées ! Vous pouvez maintenant les utiliser sur votre serveur.');
  } catch (error) {
    console.error('Erreur enregistrement commandes:', error);
  }
});

// Helper pour fabriquer le message Discord visuel
function buildRideEmbed(driverName, destination, time, rdv, totalSeats, passengers) {
  const remaining = totalSeats - passengers.length;
  const isFull = remaining <= 0;
  const bar = '🟩'.repeat(passengers.length) + '⬜'.repeat(Math.max(0, remaining));
  
  const embed = new EmbedBuilder()
    .setColor(isFull ? 0xEF4444 : 0x0EA5E9)
    .setTitle(`🚗 Navette ${destination} • Départ ${time}`)
    .setDescription(`Chauffeur : **${driverName}**\n📍 Rendez-vous : **${rdv || 'Atterrissage habituel'}**`)
    .addFields(
      { 
        name: `Places : ${passengers.length}/${totalSeats} (${isFull ? '🔴 COMPLET' : `${remaining} libre(s)`})`, 
        value: bar 
      },
      { 
        name: '👥 Passagers inscrits', 
        value: passengers.length > 0 ? passengers.map((p, i) => `${i + 1}. ${p}`).join('\n') : '*Aucun passager pour l\'instant — Cliquez sur [Je monte] !*' 
      }
    )
    .setFooter({ text: "Club Les Z'éléphants • Cliquez ci-dessous pour réserver votre place" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ride_join')
      .setLabel(isFull ? 'Navette Complète' : '🚗 Je monte (+1 place)')
      .setStyle(isFull ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(isFull),
    new ButtonBuilder()
      .setCustomId('ride_leave')
      .setLabel('❌ Se désister')
      .setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [row] };
}

// 1. Slash command (/covoit)
client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'covoit') {
      const dest = interaction.options.getString('destination');
      const time = interaction.options.getString('heure');
      const places = interaction.options.getInteger('places');
      const rdv = interaction.options.getString('rdv') || 'Atterrissage habituel';

      const payload = buildRideEmbed(interaction.user.displayName || interaction.user.username, dest, time, rdv, places, []);
      await interaction.reply(payload);
    }
    return;
  }

  // 2. Clic sur les boutons natifs Discord
  if (interaction.isButton()) {
    const message = interaction.message;
    const oldEmbed = message.embeds[0];
    if (!oldEmbed) return;

    const titleMatch = oldEmbed.title ? oldEmbed.title.match(/Navette (.*) • Départ (.*)/) : null;
    const destination = titleMatch ? titleMatch[1] : 'Vol';
    const time = titleMatch ? titleMatch[2] : 'Aujourd\'hui';
    
    const passengersField = oldEmbed.fields.find(f => f.name.includes('Passagers'));
    let passengers = [];
    if (passengersField && !passengersField.value.includes('*Aucun')) {
      passengers = passengersField.value.split('\n').map(l => l.replace(/^\d+\.\s*/, '').trim());
    }

    const placesField = oldEmbed.fields.find(f => f.name.includes('Places'));
    let totalSeats = 4;
    if (placesField) {
      const match = placesField.name.match(/\/(\d+)/);
      if (match) totalSeats = parseInt(match[1], 10);
    }

    const userName = interaction.user.displayName || interaction.user.username;

    if (interaction.customId === 'ride_join') {
      if (passengers.includes(userName)) {
        return interaction.reply({ content: '⚠️ Tu es déjà inscrit dans cette navette !', ephemeral: true });
      }
      if (passengers.length >= totalSeats) {
        return interaction.reply({ content: '🔴 Navette déjà complète !', ephemeral: true });
      }
      passengers.push(userName);
      
      const updated = buildRideEmbed('Le Chauffeur', destination, time, 'Voir ci-dessus', totalSeats, passengers);
      await interaction.update(updated);
      await interaction.followUp({ content: `🎉 C'est noté ${userName} ! Ta place est réservée.`, ephemeral: true });
    }

    if (interaction.customId === 'ride_leave') {
      if (!passengers.includes(userName)) {
        return interaction.reply({ content: "Tu n'étais pas inscrit dans cette navette.", ephemeral: true });
      }
      passengers = passengers.filter(p => p !== userName);
      
      const updated = buildRideEmbed('Le Chauffeur', destination, time, 'Voir ci-dessus', totalSeats, passengers);
      await interaction.update(updated);
      await interaction.followUp({ content: `Désistement pris en compte pour ${userName}.`, ephemeral: true });
    }
  }
});

// 3. Raccourci texte pour les anciens : !covoit <site> <heure> <places>
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  const content = message.content.trim();

  if (content.startsWith('!covoit')) {
    const parts = content.split(' ').slice(1);
    const dest = parts[0] || 'Verel';
    const time = parts[1] || '14h00';
    const places = parseInt(parts[2], 10) || 3;

    const payload = buildRideEmbed(message.author.displayName || message.author.username, dest, time, 'Atterrissage habituel', places, []);
    await message.channel.send(payload);
  }
});

// Serveur HTTP de maintien pour Render et Railway
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end("Bot Discord Z'éléphants Parapente en ligne 24h/24 !");
}).listen(PORT, () => {
  console.log(`🌐 Serveur Web actif sur le port ${PORT} (compatible Render & Railway)`);
});

client.login(process.env.DISCORD_BOT_TOKEN);
