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

// Mémoire locale pour synchronisation en direct avec le site web
const fs = require('fs');
let storedRides = [];
let storedOutings = [];

try {
  if (fs.existsSync('./bot_cache.json')) {
    const raw = fs.readFileSync('./bot_cache.json', 'utf8');
    const parsed = JSON.parse(raw);
    storedRides = parsed.storedRides || [];
    storedOutings = parsed.storedOutings || [];
  }
} catch (e) {
  console.log('Nouveau cache initialisé.');
}

function saveCache() {
  try {
    fs.writeFileSync('./bot_cache.json', JSON.stringify({ storedRides, storedOutings }, null, 2));
  } catch (e) {}
}

// Enregistrement des commandes /covoit et /sortie avec lieu de RDV obligatoire
const commands = [
  new SlashCommandBuilder()
    .setName('covoit')
    .setDescription('Organiser une navette / covoiturage pour un site')
    .addStringOption(opt => opt.setName('destination').setDescription('Site de vol (ex: Verel, Le Sire, Chamoux)').setRequired(true))
    .addStringOption(opt => opt.setName('rdv').setDescription('Lieu de RDV de départ (ex: Atterrissage Verel, Buisson-Rond)').setRequired(true))
    .addStringOption(opt => opt.setName('heure').setDescription('Heure de départ (ex: 14h15)').setRequired(true))
    .addIntegerOption(opt => opt.setName('places').setDescription('Nombre de places disponibles').setRequired(true))
    .addStringOption(opt => opt.setName('commentaire').setDescription('Commentaire / type de voile (facultatif)').setRequired(false)),
  new SlashCommandBuilder()
    .setName('sortie')
    .setDescription('Proposer une sortie club / cross / rando-vol')
    .addStringOption(opt => opt.setName('titre').setDescription('Titre de la sortie (ex: Sortie Cross Massif des Bauges)').setRequired(true))
    .addStringOption(opt => opt.setName('date_heure').setDescription('Date et heure (ex: Samedi 14 Juin - 09h00)').setRequired(true))
    .addStringOption(opt => opt.setName('rdv').setDescription('Lieu de rendez-vous de départ (ex: Parking atterrissage Verel)').setRequired(true))
    .addStringOption(opt => opt.setName('site').setDescription('Site ou massif cible (ex: Massif des Bauges)').setRequired(true))
    .addIntegerOption(opt => opt.setName('max').setDescription('Nombre maximum de pilotes (ex: 8)').setRequired(true))
    .addStringOption(opt => opt.setName('niveau').setDescription('Niveau requis (ex: Autonome, Tous niveaux, Cross)').setRequired(false))
    .addStringOption(opt => opt.setName('description').setDescription('Détails du vol, radio, météo (facultatif)').setRequired(false))
];

client.once('ready', async () => {
  console.log(`✅ Bot Z'éléphants connecté avec succès en tant que ${client.user.tag} !`);
  
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
  try {
    console.log('🔄 Enregistrement des commandes slash /covoit et /sortie...');
    
    // 1. Enregistrement INSTANTANÉ sur chaque serveur où le Bot est présent
    for (const [guildId, guild] of client.guilds.cache) {
      try {
        await rest.put(
          Routes.applicationGuildCommands(client.user.id, guildId),
          { body: commands }
        );
        console.log(`🚀 Commandes /covoit et /sortie activées INSTANTANÉMENT sur le serveur : "${guild.name}" !`);
      } catch (gErr) {
        console.warn(`Avertissement pour le serveur ${guild.name} :`, gErr.message);
      }
    }

    // 2. Enregistrement global
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    console.log('✅ Commandes globales enregistrées auprès de Discord.');
  } catch (error) {
    console.error('Erreur enregistrement commandes:', error);
  }
});

// Helper pour fabriquer le message Discord Covoiturage
function buildRideEmbed(driverName, destination, time, rdv, totalSeats, passengers, comment) {
  const remaining = totalSeats - passengers.length;
  const isFull = remaining <= 0;
  const bar = '🟩'.repeat(passengers.length) + '⬜'.repeat(Math.max(0, remaining));
  
  const embed = new EmbedBuilder()
    .setColor(isFull ? 0xEF4444 : 0x0EA5E9)
    .setTitle(`🚗 Navette ${destination} • Départ ${time}`)
    .setDescription(`Chauffeur : **${driverName}**\n📍 Rendez-vous départ : **${rdv || 'Atterrissage habituel'}**${comment ? `\n💬 *« ${comment} »*` : ''}`)
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

// Helper pour fabriquer le message Discord Sortie Club
function buildOutingEmbed(organizerName, title, dateHeure, rdv, site, maxPilotes, niveau, description, participants) {
  const remaining = maxPilotes - participants.length;
  const isFull = remaining <= 0;
  const bar = '🟦'.repeat(participants.length) + '⬜'.repeat(Math.max(0, remaining));

  const embed = new EmbedBuilder()
    .setColor(isFull ? 0x8B5CF6 : 0x10B981)
    .setTitle(`📅 Sortie Club : ${title}`)
    .setDescription(`Organisateur : **${organizerName}**\n⏰ Date & Heure : **${dateHeure}**\n📍 RDV de départ : **${rdv}**\n🪂 Site / Massif : **${site}**\n🎓 Niveau : **${niveau || 'Tous pilotes'}**${description ? `\n\n📝 *« ${description} »*` : ''}`)
    .addFields(
      { 
        name: `Pilotes : ${participants.length}/${maxPilotes} (${isFull ? '🔴 GROUPE COMPLET' : `${remaining} place(s) restante(s)`})`, 
        value: bar 
      },
      { 
        name: '👥 Pilotes participants', 
        value: participants.length > 0 ? participants.map((p, i) => `${i + 1}. ${p}`).join('\n') : '*Aucun inscrit pour le moment — Cliquez sur [Je participe] !*' 
      }
    )
    .setFooter({ text: "Club Parapente Les Z'éléphants • Cliquez ci-dessous pour rejoindre" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('outing_join')
      .setLabel(isFull ? 'Groupe Complet' : '🪂 Je participe !')
      .setStyle(isFull ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(isFull),
    new ButtonBuilder()
      .setCustomId('outing_leave')
      .setLabel('❌ Se désister')
      .setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [row] };
}

// 1. Gestion des Slash commands (/covoit et /sortie)
client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    // --- /covoit ---
    if (interaction.commandName === 'covoit') {
      const dest = interaction.options.getString('destination');
      const rdv = interaction.options.getString('rdv');
      const time = interaction.options.getString('heure');
      const places = interaction.options.getInteger('places');
      const comment = interaction.options.getString('commentaire') || '';

      const driver = interaction.user.displayName || interaction.user.username;
      const payload = buildRideEmbed(driver, dest, time, rdv, places, [], comment);
      await interaction.reply(payload);

      // Enregistrer pour synchronisation site web
      storedRides.unshift({
        id: 'discord-ride-' + Date.now(),
        driverName: driver,
        departurePlace: rdv,
        destinationSiteName: dest,
        destinationSiteId: dest.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        departureTime: time,
        availableSeats: places,
        totalSeats: places,
        wingTypes: 'Solo / Tandem bienvenus',
        passengers: [],
        comment: comment || 'Proposé sur Discord',
        createdAt: new Date().toISOString(),
        discordMessageId: interaction.id
      });
      saveCache();
      return;
    }

    // --- /sortie ---
    if (interaction.commandName === 'sortie') {
      const titre = interaction.options.getString('titre');
      const dateHeure = interaction.options.getString('date_heure');
      const rdv = interaction.options.getString('rdv');
      const site = interaction.options.getString('site');
      const max = interaction.options.getInteger('max');
      const niveau = interaction.options.getString('niveau') || 'Tous pilotes';
      const desc = interaction.options.getString('description') || '';

      const organizer = interaction.user.displayName || interaction.user.username;
      const payload = buildOutingEmbed(organizer, titre, dateHeure, rdv, site, max, niveau, desc, []);
      await interaction.reply(payload);

      // Enregistrer pour synchronisation site web
      const now = new Date();
      storedOutings.unshift({
        id: 'discord-outing-' + Date.now(),
        title: titre,
        type: 'cross_debutant',
        typeLabel: niveau,
        date: now.toISOString().split('T')[0],
        time: dateHeure,
        siteName: site,
        meetingPoint: rdv,
        organizerId: interaction.user.id,
        organizerName: organizer,
        organizerAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
        organizerPhone: '',
        organizerRole: 'Membre Discord',
        conditionsRequired: {
          minPilotLevel: niveau,
          gearRequired: ['Radio 146.500', 'Parachute de secours']
        },
        maxParticipants: max,
        participants: [],
        status: 'confirmed',
        description: desc || `RDV : ${rdv} • ${dateHeure}`,
        createdAt: new Date().toISOString(),
        discordMessageId: interaction.id
      });
      saveCache();
      return;
    }
  }

  // 2. Clic sur les boutons natifs Discord
  if (interaction.isButton()) {
    const message = interaction.message;
    const oldEmbed = message.embeds[0];
    if (!oldEmbed) return;
    const userName = interaction.user.displayName || interaction.user.username;

    // --- Boutons Navette Covoiturage ---
    if (interaction.customId === 'ride_join' || interaction.customId === 'ride_leave') {
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

      if (interaction.customId === 'ride_join') {
        if (passengers.includes(userName)) {
          return interaction.reply({ content: '⚠️ Tu es déjà inscrit dans cette navette !', ephemeral: true });
        }
        if (passengers.length >= totalSeats) {
          return interaction.reply({ content: '🔴 Navette déjà complète !', ephemeral: true });
        }
        passengers.push(userName);
      } else {
        if (!passengers.includes(userName)) {
          return interaction.reply({ content: "Tu n'étais pas inscrit dans cette navette.", ephemeral: true });
        }
        passengers = passengers.filter(p => p !== userName);
      }

      const updated = buildRideEmbed('Le Chauffeur', destination, time, 'Voir description', totalSeats, passengers, '');
      await interaction.update(updated);

      // Mettre à jour le cache du site
      const targetRide = storedRides.find(r => r.destinationSiteName === destination && r.departureTime === time);
      if (targetRide) {
        targetRide.passengers = passengers;
        targetRide.availableSeats = Math.max(0, totalSeats - passengers.length);
        saveCache();
      }
      return;
    }

    // --- Boutons Sortie Club ---
    if (interaction.customId === 'outing_join' || interaction.customId === 'outing_leave') {
      const title = oldEmbed.title ? oldEmbed.title.replace('📅 Sortie Club : ', '') : 'Sortie';
      
      const pilotsField = oldEmbed.fields.find(f => f.name.includes('Pilotes participants'));
      let participants = [];
      if (pilotsField && !pilotsField.value.includes('*Aucun')) {
        participants = pilotsField.value.split('\n').map(l => l.replace(/^\d+\.\s*/, '').trim());
      }

      const placesField = oldEmbed.fields.find(f => f.name.includes('Pilotes :'));
      let maxPilotes = 8;
      if (placesField) {
        const match = placesField.name.match(/\/(\d+)/);
        if (match) maxPilotes = parseInt(match[1], 10);
      }

      if (interaction.customId === 'outing_join') {
        if (participants.includes(userName)) {
          return interaction.reply({ content: '⚠️ Tu es déjà inscrit à cette sortie !', ephemeral: true });
        }
        if (participants.length >= maxPilotes) {
          return interaction.reply({ content: '🔴 Groupe déjà complet !', ephemeral: true });
        }
        participants.push(userName);
      } else {
        if (!participants.includes(userName)) {
          return interaction.reply({ content: "Tu n'étais pas inscrit à cette sortie.", ephemeral: true });
        }
        participants = participants.filter(p => p !== userName);
      }

      const updated = buildOutingEmbed('L\'organisateur', title, 'Voir description', 'Voir description', 'Massif', maxPilotes, 'Tous niveaux', '', participants);
      await interaction.update(updated);

      // Mettre à jour le cache du site
      const targetOuting = storedOutings.find(o => o.title === title);
      if (targetOuting) {
        targetOuting.participants = participants.map(p => ({
          id: 'p-' + p,
          name: p,
          status: 'confirmed',
          joinedAt: new Date().toISOString()
        }));
        saveCache();
      }
      return;
    }
  }
});

// 3. Raccourci texte pour les anciens : !covoit <site> <rdv> <heure> <places>
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  const content = message.content.trim();

  if (content.startsWith('!covoit')) {
    const parts = content.split(' ').slice(1);
    const dest = parts[0] || 'Verel';
    const rdv = parts[1] || 'Atterro';
    const time = parts[2] || '14h00';
    const places = parseInt(parts[3], 10) || 3;

    const payload = buildRideEmbed(message.author.displayName || message.author.username, dest, time, rdv, places, [], 'Créé via !covoit');
    await message.channel.send(payload);

    storedRides.unshift({
      id: 'discord-ride-' + Date.now(),
      driverName: message.author.displayName || message.author.username,
      departurePlace: rdv,
      destinationSiteName: dest,
      destinationSiteId: dest.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      departureTime: time,
      availableSeats: places,
      totalSeats: places,
      wingTypes: 'Solo / Tandem bienvenus',
      passengers: [],
      comment: 'Créé via !covoit',
      createdAt: new Date().toISOString()
    });
    saveCache();
  }
});

// Serveur HTTP REST avec CORS pour synchronisation en direct avec le site web
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  // En-têtes CORS universels pour autoriser la consultation depuis le site web
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Endpoint de synchronisation bi-directionnelle
  if (req.url === '/api/sync' || req.url === '/api/rides') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      status: 'ok',
      covoits: storedRides,
      sorties: storedOutings,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Page d'accueil / test de santé
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end("Bot Discord Z'éléphants Parapente en ligne 24h/24 ! API de synchronisation active.");
}).listen(PORT, () => {
  console.log(`🌐 Serveur Web actif sur le port ${PORT} (compatible Render & Railway)`);
});

client.login(process.env.DISCORD_BOT_TOKEN);
