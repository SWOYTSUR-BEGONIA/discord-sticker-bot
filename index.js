const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
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
    return { targetChannelId: null };
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
        .setDescription('設定接收表情符號自動生成的專用頻道')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option => option.setName('頻道').setDescription('選擇文字頻道').setRequired(true)),
    new SlashCommandBuilder()
        .setName('查看設定')
        .setDescription('查看目前設定的頻道')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('重置設定')
        .setDescription('清除已設定的頻道')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(command => command.toJSON());

client.once(Events.ClientReady, async () => {
    console.log(`🤖 表情符號自動生成工具已上線！登入身分：${client.user.tag}`);
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
            .setTitle('📖 表情符號自動生成工具')
            .setColor(0x00A8FF)
            .setDescription('在指定頻道發送圖片，機器人會自動將其轉為伺服器表情符號！')
            .addFields([
                { name: '⚙️ 指令說明', value: '`%/設定頻道` — 指定自動生成頻道\n`/查看設定` — 查看目前頻道\n`/重置設定` — 清除設定' }
            ]);
        return interaction.reply({ embeds: [helpEmbed], flags: [MessageFlags.Ephemeral] });
    }

    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: '❌ 您沒有權限使用此指令！', flags: [MessageFlags.Ephemeral] });
    }

    if (commandName === '設定頻道') {
        const channel = interaction.options.getChannel('頻道');
        db.targetChannelId = channel.id;
        saveDB(db);
        return interaction.reply({ content: `✅ 成功將表情符號自動生成頻道設定為：${channel}`, flags: [MessageFlags.Ephemeral] });
    }

    if (commandName === '查看設定') {
        const channelMention = db.targetChannelId ? `<#${db.targetChannelId}>` : '尚未設定';
        const infoEmbed = new EmbedBuilder()
            .setTitle('⚙️ 當前設定')
            .setColor(0xF1C40F)
            .addFields([
                { name: '自動生成頻道', value: channelMention }
            ]);
        return interaction.reply({ embeds: [infoEmbed], flags: [MessageFlags.Ephemeral] });
    }

    if (commandName === '重置設定') {
        db.targetChannelId = null;
        saveDB(db);
        return interaction.reply({ content: '🗑️ 已清空頻道設定！', flags: [MessageFlags.Ephemeral] });
    }
});

// 當用戶在指定頻道發送圖片時，直接自動生成表情符號
client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !db.targetChannelId || message.channel.id !== db.targetChannelId) return;

    const attachment = message.attachments.first();
    if (!attachment || !attachment.contentType || !attachment.contentType.startsWith('image/')) return;

    try {
        const emojiName = `emoji_${Date.now().toString().slice(-6)}`;
        const guild = message.guild; 

        // 自動建立表情符號
        const createdEmoji = await guild.emojis.create({
            attachment: attachment.url,
            name: emojiName,
            reason: `由用戶 ${message.author.tag} 透過頻道自動生成`
        });

        // 在頻道回覆成功訊息與生成的表情符號
        await message.reply({
            content: `🎉 成功將圖片轉為表情符號！\n**投稿者：** ${message.author} (${message.author.tag})\n**生成的表情符號：** ${createdEmoji} (\`:${emojiName}:\`)`
        });

    } catch (error) {
        console.error(error);
        await message.reply(`❌ 自動生成表情符號失敗！請確認圖片是否符合 Discord 限制（小於 256KB、建議正方形），或伺服器表情符號名額是否已滿。`);
    }
});

client.login(process.env.DISCORD_TOKEN);
