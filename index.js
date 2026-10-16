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
    } catch (e) {}
    return { targetChannelId: null, adminIds: [] };
}

function saveDB(db) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
    } catch (e) {}
}

let db = loadDB();

const commands = [
    new SlashCommandBuilder().setName('help').setDescription('顯示幫助頁面'),
    new SlashCommandBuilder().setName('幫助').setDescription('顯示幫助頁面'),
    new SlashCommandBuilder()
        .setName('設定頻道')
        .setDescription('設定接收表情符號投稿的專用頻道')
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
    console.log(`🤖 表情符號新增工具已成功上線！登入身分：${client.user.tag}`);
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
            .setTitle('📖 表情符號新增工具 — 說明')
            .setColor(0x00A8FF)
            .setDescription('在指定頻道發送圖片，機器人會直接在該頻道發送審核訊息給管理員。');
        return interaction.reply({ embeds: [helpEmbed], flags: [MessageFlags.Ephemeral] });
    }

    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator) && !db.adminIds.includes(interaction.user.id)) {
        return interaction.reply({ content: '❌ 您沒有權限使用此指令！', flags: [MessageFlags.Ephemeral] });
    }

    if (commandName === '設定頻道') {
        const channel = interaction.options.getChannel('頻道');
        db.targetChannelId = channel.id;
        saveDB(db);
        return interaction.reply({ content: `✅ 成功將投稿頻道設定為：${channel}`, flags: [MessageFlags.Ephemeral] });
    }

    if (commandName === '新增管理員') {
        const targetUser = interaction.options.getUser('成員');
        if (db.adminIds.includes(targetUser.id)) {
            return interaction.reply({ content: `⚠️ 該用戶已經在管理員名單中！`, flags: [MessageFlags.Ephemeral] });
        }
        db.adminIds.push(targetUser.id);
        saveDB(db);
        return interaction.reply({ content: `✅ 已將 ${targetUser.tag} 新增為管理員！`, flags: [MessageFlags.Ephemeral] });
    }

    if (commandName === '刪除管理員') {
        const targetUser = interaction.options.getUser('成員');
        db.adminIds = db.adminIds.filter(id => id !== targetUser.id);
        saveDB(db);
        return interaction.reply({ content: `✅ 已將 ${targetUser.tag} 從管理員中移除！`, flags: [MessageFlags.Ephemeral] });
    }

    if (commandName === '查看設定') {
        const channelMention = db.targetChannelId ? `<#${db.targetChannelId}>` : '尚未設定';
        const adminList = db.adminIds.length > 0 ? db.adminIds.map(id => `<@${id}>`).join(', ') : '無';
        const infoEmbed = new EmbedBuilder()
            .setTitle('⚙️ 當前設定')
            .addFields({ name: '頻道', value: channelMention }, { name: '管理員', value: adminList });
        return interaction.reply({ embeds: [infoEmbed], flags: [MessageFlags.Ephemeral] });
    }

    if (commandName === '重置設定') {
        db.targetChannelId = null;
        db.adminIds = [];
        saveDB(db);
        return interaction.reply({ content: '🗑️ 已清空所有設定！', flags: [MessageFlags.Ephemeral] });
    }
});

// 當用戶在指定頻道發送圖片時
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !db.targetChannelId || message.channel.id !== db.targetChannelId) return;

    const attachment = message.attachments.first();
    if (!attachment || !attachment.contentType || !attachment.contentType.startsWith('image/')) return;

    // 組合按鈕與審核面板
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`approve_${message.author.id}_${Buffer.from(attachment.url).toString('base64')}`)
            .setLabel('是 (新增為表情符號)')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`reject_${message.author.id}`)
            .setLabel('否 (駁回)')
            .setStyle(ButtonStyle.Danger)
    );

    // 列出管理員 @ 提及，確保管理員能第一時間注意到
    const adminMentions = db.adminIds.length > 0 ? db.adminIds.map(id => `<@${id}>`).join(' ') : '（未設定管理員）';

    const embed = new EmbedBuilder()
        .setTitle('📢 新的表情符號投稿審核')
        .setDescription(`**投稿者：** ${message.author.tag} (<@${message.author.id}>)\n請管理員點擊下方按鈕決定是否新增為伺服器表情符號。`)
        .setImage(attachment.url)
        .setColor(0x3498DB);

    // 直接發送在同一個頻道內！
    await message.channel.send({
        content: `請管理員進行審核：${adminMentions}`,
        embeds: [embed],
        components: [row]
    });
});

// 處理管理員點擊按鈕
client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    if (!db.adminIds.includes(interaction.user.id) && !interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ 您不是審核管理員！', flags: [MessageFlags.Ephemeral] });
    }

    const [action, authorId, encodedUrl] = interaction.customId.split('_');

    if (action === 'approve') {
        const imageUrl = Buffer.from(encodedUrl, 'base64').toString('ascii');
        await interaction.update({ content: '⏳ 正在建立伺服器表情符號...', embeds: [], components: [] });

        try {
            const emojiName = `emoji_${Date.now().toString().slice(-6)}`;
            const guild = interaction.guild; 

            // 建立伺服器表情符號 (Custom Emoji)
            const createdEmoji = await guild.emojis.create({
                attachment: imageUrl,
                name: emojiName,
                reason: `由用戶投稿`
            });

            await interaction.editReply(`✅ 已成功新增表情符號：${createdEmoji} (名稱: \`${emojiName}\`)`);

            // 同時私訊通知投稿者：包含投稿者名稱、以及直接把生成好的表情符號貼上
            try {
                const authorUser = await client.users.fetch(authorId);
                await authorUser.send(`🎉 **您的表情符號已成功新增！**\n**投稿者：** ${authorUser.tag} (<@${authorId}>)\n**生成的表情符號：** ${createdEmoji}`);
            } catch (e) {}

        } catch (error) {
            console.error(error);
            await interaction.editReply(`❌ 建立表情符號失敗！請檢查圖片是否符合 Discord 表情符號限制（小於 256KB、建議正方形）。`);
        }
    } else if (action === 'reject') {
        await interaction.update({ content: '❌ 已駁回此投稿。', embeds: [], components: [] });
        try {
            const authorUser = await client.users.fetch(authorId);
            await authorUser.send(`❌ 很抱歉，您投稿的圖片已被管理員駁回。\n**投稿者：** <@${authorId}>`);
        } catch (e) {}
    }
});

client.login(process.env.DISCORD_TOKEN);
