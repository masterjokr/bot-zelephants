// ============================================================
// BOT DISCORD OFFICIEL - LES Z'ÉLÉPHANTS PARAPENTE
// Synchronisation bidirectionnelle, commandes /covoit et /sortie,
// boutons natifs Discord [Je monte] / [Je participe] / [Se désister]
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
const fs = require('fs');
const http = require('http');

if (!process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN.includes('COLLEZ_VOTRE_TOKEN')) {
  console.error("❌ ERREUR : Le token du bot n'est pas configuré dans le fichier .env !");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Cache local persistent pour synchronisation avec le site web
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

// Recherche intelligente du meilleur salon textuel Discord
function findTargetChannel(type, preferredChannelId) {
  if (preferredChannelId) {
    const ch = client.channels.cache.get(preferredChannelId);
    if (ch && ch.isTextBased()) return ch;
  }
  const keywords = type === 'covoit' 
    ? ['covoit', 'navette', 'voiture', 'trajet', 'transport'] 
    : ['sortie', 'calendrier', 'vol', 'activite', 'programme'];
  
  for (const [_, guild] of client.guilds.cache) {
    for (const [_, channel] of guild.channels.cache) {
      if (channel.isTextBased()) {
        const n = channel.name.toLowerCase();
        if (keywords.some(k => n.includes(k))) return channel;
      }
    }
  }
  for (const [_, guild] of client.guilds.cache) {
    for (const [_, channel] of guild.channels.cache) {
      if (channel.isTextBased() && (channel.name.includes('general') || channel.name.includes('discussion') || channel.name.includes('accueil'))) {
        return channel;
      }
    }
  }
  for (const [_, guild] of client.guilds.cache) {
    for (const [_, channel] of guild.channels.cache) {
      if (channel.isTextBased()) return channel;
    }
  }
  return null;
}

// Construction Embed Covoiturage avec boutons natifs Discord
function buildRideEmbed(driverName, destination, time, rdv, totalSeats, passengers, comment, rideId) {
  const safeSeats = totalSeats || 4;
  const safePassengers = Array.isArray(passengers) ? passengers : [];
  const remaining = safeSeats - safePassengers.length;
  const isFull = remaining <= 0;
  const bar = '🟩'.repeat(Math.min(safePassengers.length, safeSeats)) + '⬜'.repeat(Math.max(0, remaining));
  const safeId = rideId || '';
  
  const embed = new EmbedBuilder()
    .setColor(isFull ? 0xEF4444 : 0x0EA5E9)
    .setTitle(`🚗 Navette ${destination || 'Site de vol'} • Départ ${time || 'À convenir'}`)
    .setDescription(`Chauffeur : **${driverName || 'Pilote Zéléph'}**\n📍 Rendez-vous départ : **${rdv || 'Atterrissage habituel'}**${comment ? `\n💬 *« ${comment} »*` : ''}`)
    .addFields(
      { 
        name: `Places : ${safePassengers.length}/${safeSeats} (${isFull ? '🔴 COMPLET' : `${remaining} libre(s)`})`, 
        value: bar || '⬜' 
      },
      { 
        name: '👥 Passagers inscrits', 
        value: safePassengers.length > 0 ? safePassengers.map((p, i) => `${i + 1}. ${p}`).join('\n') : '*Aucun passager pour l\'instant — Cliquez sur [Je monte] !*' 
      }
    )
    .setFooter({ text: "Club Les Z'éléphants • Cliquez ci-dessous pour réserver ou vous désister" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(safeId ? `ride_join:${safeId}` : 'ride_join')
      .setLabel(isFull ? 'Navette Complète' : '🚗 Je monte (+1 place)')
      .setStyle(isFull ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(isFull),
    new ButtonBuilder()
      .setCustomId(safeId ? `ride_leave:${safeId}` : 'ride_leave')
      .setLabel('❌ Se désister')
      .setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [row] };
}

// Construction Embed Sortie Club avec boutons natifs Discord
function buildOutingEmbed(organizerName, title, dateHeure, rdv, site, maxPilotes, niveau, description, participants, outingId) {
  const safeMax = maxPilotes || 8;
  const safeParticipants = Array.isArray(participants) ? participants.map(p => typeof p === 'string' ? p : (p.name || 'Pilote')) : [];
  const remaining = safeMax - safeParticipants.length;
  const isFull = remaining <= 0;
  const bar = '🟦'.repeat(Math.min(safeParticipants.length, safeMax)) + '⬜'.repeat(Math.max(0, remaining));
  const safeId = outingId || '';

  const embed = new EmbedBuilder()
    .setColor(isFull ? 0x8B5CF6 : 0x10B981)
    .setTitle(`📅 Sortie Club : ${title || 'Sortie Parapente'}`)
    .setDescription(`Organisateur : **${organizerName || 'Organisateur Zéléph'}**\n⏰ Date & Heure : **${dateHeure || 'À convenir'}**\n📍 RDV de départ : **${rdv || 'Atterrissage'}**\n🪂 Site / Massif : **${site || 'Massif'}**\n🎓 Niveau : **${niveau || 'Tous pilotes'}**${description ? `\n\n📝 *« ${description} »*` : ''}`)
    .addFields(
      { 
        name: `Pilotes : ${safeParticipants.length}/${safeMax} (${isFull ? '🔴 GROUPE COMPLET' : `${remaining} place(s) restante(s)`})`, 
        value: bar || '⬜' 
      },
      { 
        name: '👥 Pilotes participants', 
        value: safeParticipants.length > 0 ? safeParticipants.map((p, i) => `${i + 1}. ${p}`).join('\n') : '*Aucun inscrit pour le moment — Cliquez sur [Je participe] !*' 
      }
    )
    .setFooter({ text: "Club Parapente Les Z'éléphants • Cliquez ci-dessous pour rejoindre ou vous désister" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(safeId ? `outing_join:${safeId}` : 'outing_join')
      .setLabel(isFull ? 'Groupe Complet' : '🪂 Je participe !')
      .setStyle(isFull ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(isFull),
    new ButtonBuilder()
      .setCustomId(safeId ? `outing_leave:${safeId}` : 'outing_leave')
      .setLabel('❌ Se désister')
      .setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [row] };
}

// Commandes Slash /covoit et /sortie
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
    for (const [guildId, guild] of client.guilds.cache) {
      try {
        await rest.put(
          Routes.applicationGuildCommands(client.user.id, guildId),
          { body: commands }
        );
        console.log(`🚀 Commandes enregistrées sur : "${guild.name}"`);
      } catch (gErr) {
        console.warn(`Avertissement ${guild.name}:`, gErr.message);
      }
    }
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  } catch (error) {
    console.error('Erreur enregistrement commandes:', error);
  }
});

// Interactions (Slash commands & Boutons)
client.on('interactionCreate', async interaction => {
  // 1. Slash commands
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'covoit') {
      const dest = interaction.options.getString('destination');
      const rdv = interaction.options.getString('rdv');
      const time = interaction.options.getString('heure');
      const places = interaction.options.getInteger('places');
      const comment = interaction.options.getString('commentaire') || '';

      const driver = interaction.user.displayName || interaction.user.username;
      const rideId = 'discord-ride-' + Date.now();
      const payload = buildRideEmbed(driver, dest, time, rdv, places, [], comment, rideId);
      
      await interaction.reply(payload);
      const replyMsg = await interaction.fetchReply();

      storedRides.unshift({
        id: rideId,
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
        discordMessageId: replyMsg.id,
        discordChannelId: interaction.channelId
      });
      saveCache();
      return;
    }

    if (interaction.commandName === 'sortie') {
      const titre = interaction.options.getString('titre');
      const dateHeure = interaction.options.getString('date_heure');
      const rdv = interaction.options.getString('rdv');
      const site = interaction.options.getString('site');
      const max = interaction.options.getInteger('max');
      const niveau = interaction.options.getString('niveau') || 'Tous pilotes';
      const desc = interaction.options.getString('description') || '';

      const organizer = interaction.user.displayName || interaction.user.username;
      const outingId = 'discord-outing-' + Date.now();
      const payload = buildOutingEmbed(organizer, titre, dateHeure, rdv, site, max, niveau, desc, [], outingId);
      
      await interaction.reply(payload);
      const replyMsg = await interaction.fetchReply();

      const now = new Date();
      storedOutings.unshift({
        id: outingId,
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
        discordMessageId: replyMsg.id,
        discordChannelId: interaction.channelId
      });
      saveCache();
      return;
    }
  }

  // 2. Clics sur boutons Discord
  if (interaction.isButton()) {
    const message = interaction.message;
    const oldEmbed = message.embeds[0];
    if (!oldEmbed) return;
    const userName = interaction.member?.displayName || interaction.user.displayName || interaction.user.username;
    const customId = interaction.customId;

    // --- Navettes ---
    if (customId === 'ride_join' || customId.startsWith('ride_join:') || customId === 'ride_leave' || customId.startsWith('ride_leave:')) {
      const isJoin = customId.startsWith('ride_join');
      const rideId = customId.includes(':') ? customId.split(':')[1] : null;

      let targetRide = storedRides.find(r => (rideId && r.id === rideId) || r.discordMessageId === message.id);
      
      let driverName = targetRide?.driverName;
      let destination = targetRide?.destinationSiteName;
      let time = targetRide?.departureTime;
      let rdv = targetRide?.departurePlace || 'Atterrissage';
      let totalSeats = targetRide?.totalSeats || 4;
      let passengers = targetRide?.passengers ? [...targetRide.passengers] : [];
      let comment = targetRide?.comment || '';

      if (!targetRide) {
        const titleMatch = oldEmbed.title ? oldEmbed.title.match(/Navette (.*) • Départ (.*)/) : null;
        if (titleMatch) {
          destination = titleMatch[1];
          time = titleMatch[2];
        }
        const passengersField = oldEmbed.fields.find(f => f.name.includes('Passagers'));
        if (passengersField && !passengersField.value.includes('*Aucun')) {
          passengers = passengersField.value.split('\n').map(l => l.replace(/^\d+\.\s*/, '').trim());
        }
        const placesField = oldEmbed.fields.find(f => f.name.includes('Places'));
        if (placesField) {
          const match = placesField.name.match(/\/(\d+)/);
          if (match) totalSeats = parseInt(match[1], 10);
        }
      }

      if (isJoin) {
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

      const effectiveRideId = rideId || targetRide?.id || ('discord-ride-' + Date.now());
      const updated = buildRideEmbed(driverName || 'Le Chauffeur', destination || 'Vol', time || 'Aujourd\'hui', rdv, totalSeats, passengers, comment, effectiveRideId);
      await interaction.update(updated);

      if (targetRide) {
        targetRide.passengers = passengers;
        targetRide.availableSeats = Math.max(0, totalSeats - passengers.length);
        targetRide.discordMessageId = message.id;
        targetRide.discordChannelId = message.channelId;
      } else {
        storedRides.unshift({
          id: effectiveRideId,
          driverName: driverName || 'Le Chauffeur',
          departurePlace: rdv,
          destinationSiteName: destination || 'Vol',
          destinationSiteId: (destination || 'vol').toLowerCase().replace(/[^a-z0-9]/g, '-'),
          departureTime: time || 'Aujourd\'hui',
          availableSeats: Math.max(0, totalSeats - passengers.length),
          totalSeats,
          wingTypes: 'Solo / Tandem bienvenus',
          passengers,
          comment,
          createdAt: new Date().toISOString(),
          discordMessageId: message.id,
          discordChannelId: message.channelId
        });
      }
      saveCache();
      return;
    }

    // --- Sorties Club ---
    if (customId === 'outing_join' || customId.startsWith('outing_join:') || customId === 'outing_leave' || customId.startsWith('outing_leave:')) {
      const isJoin = customId.startsWith('outing_join');
      const outingId = customId.includes(':') ? customId.split(':')[1] : null;

      let targetOuting = storedOutings.find(o => (outingId && o.id === outingId) || o.discordMessageId === message.id);

      let organizerName = targetOuting?.organizerName;
      let title = targetOuting?.title || (oldEmbed.title ? oldEmbed.title.replace('📅 Sortie Club : ', '') : 'Sortie Club');
      let dateHeure = targetOuting ? `${targetOuting.date} à ${targetOuting.time}` : 'Voir description';
      let rdv = targetOuting?.meetingPoint || 'Voir description';
      let site = targetOuting?.siteName || 'Massif';
      let maxPilotes = targetOuting?.maxParticipants || 8;
      let niveau = targetOuting?.conditionsRequired?.minPilotLevel || targetOuting?.typeLabel || 'Tous niveaux';
      let description = targetOuting?.description || '';
      let participants = targetOuting?.participants ? targetOuting.participants.map(p => typeof p === 'string' ? p : p.name) : [];

      if (!targetOuting) {
        const pilotsField = oldEmbed.fields.find(f => f.name.includes('Pilotes participants'));
        if (pilotsField && !pilotsField.value.includes('*Aucun')) {
          participants = pilotsField.value.split('\n').map(l => l.replace(/^\d+\.\s*/, '').trim());
        }
        const placesField = oldEmbed.fields.find(f => f.name.includes('Pilotes :'));
        if (placesField) {
          const match = placesField.name.match(/\/(\d+)/);
          if (match) maxPilotes = parseInt(match[1], 10);
        }
      }

      if (isJoin) {
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

      const effectiveOutingId = outingId || targetOuting?.id || ('discord-outing-' + Date.now());
      const updated = buildOutingEmbed(organizerName || 'L\'organisateur', title, dateHeure, rdv, site, maxPilotes, niveau, description, participants, effectiveOutingId);
      await interaction.update(updated);

      if (targetOuting) {
        targetOuting.participants = participants.map(p => ({
          id: 'p-' + p.toLowerCase().replace(/[^a-z0-9]/g, '-'),
          name: p,
          status: 'confirmed',
          joinedAt: new Date().toISOString()
        }));
        targetOuting.discordMessageId = message.id;
        targetOuting.discordChannelId = message.channelId;
      } else {
        storedOutings.unshift({
          id: effectiveOutingId,
          title,
          type: 'cross_debutant',
          typeLabel: niveau,
          date: new Date().toISOString().split('T')[0],
          time: '10:00',
          siteName: site,
          meetingPoint: rdv,
          organizerId: 'bot',
          organizerName: organizerName || 'L\'organisateur',
          organizerAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
          organizerPhone: '',
          organizerRole: 'Membre Discord',
          conditionsRequired: { minPilotLevel: niveau, gearRequired: ['Radio 146.500'] },
          maxParticipants: maxPilotes,
          participants: participants.map(p => ({
            id: 'p-' + p.toLowerCase().replace(/[^a-z0-9]/g, '-'),
            name: p,
            status: 'confirmed',
            joinedAt: new Date().toISOString()
          })),
          status: 'confirmed',
          description,
          createdAt: new Date().toISOString(),
          discordMessageId: message.id,
          discordChannelId: message.channelId
        });
      }
      saveCache();
      return;
    }
  }
});

// Raccourci texte !covoit <site> <rdv> <heure> <places>
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  const content = message.content.trim();

  if (content.startsWith('!covoit')) {
    const parts = content.split(' ').slice(1);
    const dest = parts[0] || 'Verel';
    const rdv = parts[1] || 'Atterro';
    const time = parts[2] || '14h00';
    const places = parseInt(parts[3], 10) || 3;
    const rideId = 'discord-ride-' + Date.now();

    const payload = buildRideEmbed(message.author.displayName || message.author.username, dest, time, rdv, places, [], 'Créé via !covoit', rideId);
    const sent = await message.channel.send(payload);

    storedRides.unshift({
      id: rideId,
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
      createdAt: new Date().toISOString(),
      discordMessageId: sent.id,
      discordChannelId: message.channel.id
    });
    saveCache();
  }
});

// Helper parsing JSON
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        resolve({});
      }
    });
    req.on('error', err => reject(err));
  });
}

// Serveur HTTP REST avec CORS (Render & Railway)
const PORT = process.env.PORT || 3000;
http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. Endpoint GET de synchronisation PWA
  if (req.method === 'GET' && (req.url === '/api/sync' || req.url === '/api/rides')) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      status: 'ok',
      covoits: storedRides,
      sorties: storedOutings,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // 2. Endpoint POST pour publier / mettre à jour un Covoiturage depuis la PWA
  if (req.method === 'POST' && (req.url === '/api/post-covoit' || req.url === '/api/sync-ride')) {
    try {
      const data = await parseJsonBody(req);
      const ride = data.ride || data;
      if (!ride) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'Données navette manquantes' }));
      }

      const driverName = ride.driverName || 'Pilote Zéléph';
      const dest = ride.destinationSiteName || 'Site de vol';
      const time = ride.departureTime || 'À convenir';
      const rdv = ride.departurePlace || 'Atterrissage';
      const totalSeats = ride.totalSeats || 4;
      const passengers = Array.isArray(ride.passengers) ? ride.passengers : [];
      const comment = ride.comment || '';
      const rideId = ride.id;

      const payload = buildRideEmbed(driverName, dest, time, rdv, totalSeats, passengers, comment, rideId);

      let channel = null;
      let msg = null;

      // Édition en direct sans doublon si déjà sur Discord
      if (ride.discordChannelId && ride.discordMessageId) {
        try {
          channel = await client.channels.fetch(ride.discordChannelId);
          if (channel && channel.isTextBased()) {
            msg = await channel.messages.fetch(ride.discordMessageId);
            if (msg) {
              await msg.edit(payload);
            }
          }
        } catch (editErr) {
          console.log('Message Discord existant non trouvable pour édition :', editErr.message);
        }
      }

      // Si pas encore sur Discord ou introuvable, poster dans le bon salon
      if (!msg) {
        channel = findTargetChannel('covoit', ride.discordChannelId);
        if (!channel) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'Aucun salon accessible pour poster la navette' }));
        }
        msg = await channel.send(payload);
      }

      const existingIdx = storedRides.findIndex(r => r.id === rideId || (msg && r.discordMessageId === msg.id));
      const record = {
        ...ride,
        discordMessageId: msg.id,
        discordChannelId: channel.id,
        updatedAt: new Date().toISOString()
      };
      if (existingIdx >= 0) {
        storedRides[existingIdx] = record;
      } else {
        storedRides.unshift(record);
      }
      saveCache();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        messageId: msg.id,
        channelId: channel.id,
        isPatched: Boolean(ride.discordMessageId && msg.id === ride.discordMessageId)
      }));
    } catch (err) {
      console.error('Erreur /api/post-covoit:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  // 3. Endpoint POST pour publier / mettre à jour une Sortie Club depuis la PWA
  if (req.method === 'POST' && (req.url === '/api/post-sortie' || req.url === '/api/sync-outing')) {
    try {
      const data = await parseJsonBody(req);
      const outing = data.outing || data;
      if (!outing) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, error: 'Données sortie manquantes' }));
      }

      const organizerName = outing.organizerName || 'Organisateur Zéléph';
      const title = outing.title || 'Sortie Club';
      const dateHeure = `${outing.date || ''} à ${outing.time || ''}`;
      const rdv = outing.meetingPoint || 'Atterrissage';
      const site = outing.siteName || 'Massif';
      const maxPilotes = outing.maxParticipants || 8;
      const niveau = outing.conditionsRequired?.minPilotLevel || outing.typeLabel || 'Tous niveaux';
      const description = outing.description || '';
      const participants = Array.isArray(outing.participants) ? outing.participants.map(p => typeof p === 'string' ? p : p.name) : [];
      const outingId = outing.id;

      const payload = buildOutingEmbed(organizerName, title, dateHeure, rdv, site, maxPilotes, niveau, description, participants, outingId);

      let channel = null;
      let msg = null;

      // Édition en direct sans doublon si déjà sur Discord
      if (outing.discordChannelId && outing.discordMessageId) {
        try {
          channel = await client.channels.fetch(outing.discordChannelId);
          if (channel && channel.isTextBased()) {
            msg = await channel.messages.fetch(outing.discordMessageId);
            if (msg) {
              await msg.edit(payload);
            }
          }
        } catch (editErr) {
          console.log('Message Discord existant non trouvable pour édition :', editErr.message);
        }
      }

      // Si pas encore sur Discord ou introuvable, poster dans le bon salon
      if (!msg) {
        channel = findTargetChannel('sortie', outing.discordChannelId);
        if (!channel) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'Aucun salon accessible pour poster la sortie' }));
        }
        msg = await channel.send(payload);
      }

      const existingIdx = storedOutings.findIndex(o => o.id === outingId || (msg && o.discordMessageId === msg.id));
      const record = {
        ...outing,
        discordMessageId: msg.id,
        discordChannelId: channel.id,
        updatedAt: new Date().toISOString()
      };
      if (existingIdx >= 0) {
        storedOutings[existingIdx] = record;
      } else {
        storedOutings.unshift(record);
      }
      saveCache();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: true,
        messageId: msg.id,
        channelId: channel.id,
        isPatched: Boolean(outing.discordMessageId && msg.id === outing.discordMessageId)
      }));
    } catch (err) {
      console.error('Erreur /api/post-sortie:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }

  // Page d'accueil / test de santé
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Bot Discord Z'éléphants</title>
    <style>
      body { font-family: system-ui, sans-serif; background: #0f172a; color: white; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
      .card { background: #1e293b; padding: 2rem; border-radius: 1rem; border: 1px solid rgba(255,255,255,0.1); max-width: 500px; text-align: center; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
      .badge { display: inline-block; background: #10b981; color: #022c22; font-weight: bold; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.875rem; margin-bottom: 1rem; }
      h1 { margin: 0 0 0.5rem 0; font-size: 1.5rem; }
      p { color: #94a3b8; font-size: 0.95rem; line-height: 1.5; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="badge">● EN LIGNE 24H/24</div>
      <h1>🐘 Bot Discord Z'éléphants Volants</h1>
      <p>Passerelle active avec boutons natifs Discord et synchronisation temps réel avec l'application PWA.</p>
    </div>
  </body>
</html>`);
}).listen(PORT, () => {
  console.log(`🌐 Serveur Web actif sur le port ${PORT} (compatible Render & Railway)`);
});

client.login(process.env.DISCORD_BOT_TOKEN);
