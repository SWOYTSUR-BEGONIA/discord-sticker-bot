const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder,
    SlashCommandBuilder,
    PermissionFlagsBits,
    REST,
    Routes,
    MessageFlags,
    Events
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const DB_FILE = path.join(__dirname, 'database.json');

function loadDB() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('讀取資料庫失敗：', e);
    }
    return { targetChannelId: null, adminIds: [] };
}

function saveDB(db) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
    } catch (e) {
        console.error('儲存資料庫失敗：', e);
    }
}

let db = loadDB();

const commands = [
    new SlashCommandBuilder().setName('help').setDescription('顯示幫助頁面'),
    new SlashCommandBuilder().setName('幫助').setDescription('顯示幫助頁面'),
    new SlashCommandBuilder()
        .setName('設定頻道')
        .setDescription('設定接收貼圖投稿的專用頻道')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option => option.setName('頻道').setDescription('選擇文字頻道').setRequired(true)),
    new SlashCommandBuilder()
        .setName('新增管理員')
        .setDescription('新增審核管理員')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option => option.setName('成員').setDescription('選擇成員').setRequired(true)),
    new SlashCommandBuilder()
        .setName('刪除管理員')
        .setDescription('移除審核管理員')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option => option.setName('成員').setDescription('選擇成員').setRequired(true)),
    new SlashCommandBuilder()
        .setName('查看設定')
        .setDescription('查看目前設定')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('重置設定')
        .setDescription('清除所有設定')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(command => command.toJSON());

client.once(Events.ClientReady, async () => {
    console.log(`🤖 貼圖新增工具已成功上線！登入身分：${client.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ 成功註冊斜線指令！');
    } catch (error) {
        console.error('❌ 註冊斜線指令失敗：', error);
    }
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === 'help' || commandName === '幫助') {
        const helpEmbed = new EmbedBuilder()
            .setTitle('📖 貼圖新增工具 — 幫助與說明')
            .setColor(0x00A8FF)
            .setDescription('在指定頻道發送圖片即可自動送出審核。')
            .addFields(
                { name: '⚙️ 管理員指令', value: '`/設定頻道`\n`/新增管理員`\n`/刪除管理員`\n`/查看設定`\n`/重置設定`' }
            );
        return interaction.reply({ embeds: [helpEmbed], flags: [MessageFlags.Ephemeral] });
    }

    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator) && !db.adminIds.includes(interaction.user.id)) {
        return interaction.reply({ content: '❌ 您沒有權限使用此指令！', flags: [MessageFlags.Ephemeral] });
    }

    if (commandName === '設定頻道') {
        const channel = interaction.options.getChannel('頻道');
        db.targetChannelId = channel.id;
        saveDB(db);
        return interaction.reply({ content: `✅ 成功將投稿頻道設定為：${channel}`, flags: [MessageFlags.Ephemeral] }); }  if (commandName === '新增管理員') { const targetUser = interaction.options.getUser('成員'); if (db.adminIds.includes(targetUser.id)) { return interaction.reply({ content: `⚠️ 該用戶已經在管理員名單中！`, flags: [MessageFlags.Ephemeral] }); } db.adminIds.push(targetUser.id); saveDB(db); return interaction.reply({ content: `✅ 已將 ${targetUser.tag} 新增為管理員！`, flags: [MessageFlags.Ephemeral] });
    }

    if (commandName === '刪除管理員') {
        const targetUser = interaction.options.getUser('成員');
        db.adminIds = db.adminIds.filter(id => id !== targetUser.id);
        saveDB(db);
        return interaction.reply({ content: `✅ 已將 ${targetUser.tag} 從管理員中移除！`, flags: [MessageFlags.Ephemeral] }); }  if (commandName === '查看設定') { const channelMention = db.targetChannelId ? `<#${db.targetChannelId}>` : '尚未設定';
        const adminList = db.adminIds.length > 0 ? db.adminIds.map(id => `<@${id}>`).join(', ') : '無'; const infoEmbed = new EmbedBuilder() .setTitle('⚙️ 當前設定') .addFields({ name: '頻道', value: channelMention }, { name: '管理員', value: adminList }); return interaction.reply({ embeds: [infoEmbed], flags: [MessageFlags.Ephemeral] }); }  if (commandName === '重置設定') { db.targetChannelId = null; db.adminIds = []; saveDB(db); return interaction.reply({ content: '🗑️ 已清空所有設定！', flags: [MessageFlags.Ephemeral] }); } });  client.on(Events.MessageCreate, async (message) => { if (message.author.bot \vert{}\vert{} !db.targetChannelId \vert{}\vert{} message.channel.id !== db.targetChannelId) return;  const attachment = message.attachments.first(); if (!attachment \vert{}\vert{} !attachment.contentType \vert{}\vert{} !attachment.contentType.startsWith('image/')) return;  const row = new ActionRowBuilder().addComponents( new ButtonBuilder() .setCustomId(`approve_${message.author.id}_${Buffer.from(attachment.url).toString('base64')}`) .setLabel('是 (新增為貼圖)') .setStyle(ButtonStyle.Success), new ButtonBuilder() .setCustomId(`reject_${message.author.id}`)
            .setLabel('否 (駁回)')
            .setStyle(ButtonStyle.Danger)
    );

    const embed = new EmbedBuilder()
        .setTitle('📢 新的貼圖投稿審核')
        .setDescription(`**投稿者：** ${message.author.tag} (<@${message.author.id}>)`)
        .setImage(attachment.url)
        .setColor(0x3498DB);

    for (const adminId of db.adminIds) {
        try {
            const adminUser = await client.users.fetch(adminId);
            if (adminUser) {
                await adminUser.send({ content: `來自 **${message.guild.name}** 的審核：`, embeds: [embed], components: [row] });
            }
        } catch (e) {}
    }

    try { await message.author.send(`✅ 您的圖片已成功送出審核！`); } catch (e) {}
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    if (!db.adminIds.includes(interaction.user.id)) {
        return interaction.reply({ content: '❌ 您不是管理員！', flags: [MessageFlags.Ephemeral] });
    }

    const [action, authorId, encodedUrl] = interaction.customId.split('_');

    if (action === 'approve') {
        const imageUrl = Buffer.from(encodedUrl, 'base64').toString('ascii');
        await interaction.update({ content: '⏳ 建立貼圖中...', embeds: [], components: [] });

        try {
            const stickerName = `sticker_${Date.now().toString().slice(-6)}`; const guild = interaction.client.guilds.cache.first();  const createdSticker = await guild.stickers.create({ file: imageUrl, name: stickerName, tags: 'custom', description: `由 <@${authorId}> 投稿`
            });

            await interaction.editReply(`✅ 已成功新增貼圖：\`${createdSticker.name}\``);

            try {
                const authorUser = await client.users.fetch(authorId);
                await authorUser.send({
                    content: `🎉 **您的貼圖已成功新增！**\n**投稿者：** ${authorUser.tag} (<@${authorId}>)\n**生成的貼圖：**`,
                    stickers: [createdSticker]
                });
            } catch (e) {}

        } catch (error) {
            await interaction.editReply(`❌ 建立貼圖失敗（請檢查圖片大小是否小於 512KB）。`);
        }
    } else if (action === 'reject') {
        await interaction.update({ content: '❌ 已駁回。', embeds: [], components: [] });
        try {
            const authorUser = await client.users.fetch(authorId);
            await authorUser.send(`❌ 很抱歉，您的投稿已被駁回。`);
        } catch (e) {}
    }
});

client.login(process.env.DISCORD_TOKEN);
