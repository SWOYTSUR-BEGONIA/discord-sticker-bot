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
    Routes
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

// ----------------------------------------------------
// 資料持久化管理 (確保重啟後設定不消失)
// ----------------------------------------------------
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

// ----------------------------------------------------
// 註冊斜線指令 (Slash Commands)
// ----------------------------------------------------
const commands = [
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('顯示貼圖新增工具的使用說明與幫助頁面'),
    
    new SlashCommandBuilder()
        .setName('幫助')
        .setDescription('顯示貼圖新增工具的使用說明與幫助頁面'),

    new SlashCommandBuilder()
        .setName('設定頻道')
        .setDescription('設定接收貼圖投稿的專用頻道')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option => 
            option.setName('頻道')
                .setDescription('請選擇用於投稿圖片的文字頻道')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('新增管理員')
        .setDescription('新增一位可進行貼圖審核的管理員')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option => 
            option.setName('成員')
                .setDescription('請選擇要新增為審核者的成員')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('刪除管理員')
        .setDescription('移除一位貼圖審核管理員')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option => 
            option.setName('成員')
                .setDescription('請選擇要移除的審核者')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('查看設定')
        .setDescription('查看目前設定的投稿頻道與管理員清單')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('重置設定')
        .setDescription('清除所有已設定的頻道與管理員資料')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(command => command.toJSON());

// 機器人上線事件
client.once('ready', async () => {
    console.log(`🤖 貼圖新增工具已成功上線！登入身分：${client.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log('⏳ 開始註冊全球斜線指令...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('✅ 成功註冊斜線指令！');
    } catch (error) {
        console.error('❌ 註冊斜線指令失敗：', error);
    }
});

// ----------------------------------------------------
// 處理斜線指令互動
// ----------------------------------------------------
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // 1. 幫助頁面
    if (commandName === 'help' || commandName === '幫助') {
        const helpEmbed = new EmbedBuilder()
            .setTitle('📖 貼圖新增工具 — 幫助與說明指南')
            .setColor(0x00A8FF)
            .setDescription('本機器人能自動攔截指定頻道的投稿圖片，並發送審核通知給管理員。')
            .addFields(
                { 
                    name: '🖼️ 一般用戶投稿方式', 
                    value: '直接在指定的 **投稿頻道** 發送圖片即可，機器人會自動送出審核並保留原圖。' 
                },
                { 
                    name: '⚙️ 管理員設定指令 (需伺服器管理權限)', 
                    value: 
                        '`/設定頻道 [頻道]` — 指定接收投稿圖片的頻道\n' +
                        '`/新增管理員 [成員]` — 新增審核管理員\n' +
                        '`/刪除管理員 [成員]` — 移除審核管理員\n' +
                        '`/查看設定` — 檢查目前設定\n' +
                        '`/重置設定` — 清除所有頻道與管理員資料'
                },
                { 
                    name: '✉️ 審核與上架流程', 
                    value: '管理員會在私訊收到帶有 **[是] / [否]** 按鈕的審核通知。點擊「是」將自動建立為伺服器貼圖並私訊通知投稿者。' 
                }
            )
            .setFooter({ text: '貼圖新增工具 • 永久儲存設定' })
            .setTimestamp();

        return interaction.reply({ embeds: [helpEmbed], ephemeral: true });
    }

    // 權限檢查（後續管理指令皆需管理員權限）
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator) && !db.adminIds.includes(interaction.user.id)) {
        return interaction.reply({ content: '❌ 您沒有權限使用此管理設定指令！', ephemeral: true });
    }

    // 2. 設定頻道
    if (commandName === '設定頻道') {
        const channel = interaction.options.getChannel('頻道');
        db.targetChannelId = channel.id;
        saveDB(db);
        return interaction.reply({ content: `✅ 成功將投稿頻道設定為：${channel}`, ephemeral: true });
    }

    // 3. 新增管理員
    if (commandName === '新增管理員') {
        const targetUser = interaction.options.getUser('成員');
        if (db.adminIds.includes(targetUser.id)) {
            return interaction.reply({ content: `⚠️ ${targetUser.tag} 已經在管理員名單中了！`, ephemeral: true });
        }
        db.adminIds.push(targetUser.id);
        saveDB(db);
        return interaction.reply({ content: `✅ 已將 ${targetUser.tag} (<@${targetUser.id}>) 新增為貼圖審核管理員！`, ephemeral: true });
    }

    // 4. 刪除管理員
    if (commandName === '刪除管理員') {
        const targetUser = interaction.options.getUser('成員');
        if (!db.adminIds.includes(targetUser.id)) {
            return interaction.reply({ content: `⚠️ ${targetUser.tag} 不在管理員名單中！`, ephemeral: true });
        }
        db.adminIds = db.adminIds.filter(id => id !== targetUser.id);
        saveDB(db);
        return interaction.reply({ content: `✅ 已將 ${targetUser.tag} 從管理員名單中移除！`, ephemeral: true });
    }

    // 5. 查看設定
    if (commandName === '查看設定') {
        const channelMention = db.targetChannelId ? `<#${db.targetChannelId}>` : '尚未設定';
        const adminList = db.adminIds.length > 0 
            ? db.adminIds.map(id => `<@${id}>`).join(', ') 
            : '尚未設定任何指定管理員';

        const infoEmbed = new EmbedBuilder()
            .setTitle('⚙️ 當前機器人設定狀態')
            .setColor(0xF1C40F)
            .addFields(
                { name: '📌 投稿專用頻道', value: channelMention },
                { name: '👑 審核管理員名單', value: adminList }
            );

        return interaction.reply({ embeds: [infoEmbed], ephemeral: true });
    }

    // 6. 重置設定
    if (commandName === '重置設定') {
        db.targetChannelId = null;
        db.adminIds = [];
        saveDB(db);
        return interaction.reply({ content: '🗑️ 已成功清空所有頻道與管理員設定資料！', ephemeral: true });
    }
});

// ----------------------------------------------------
// 監聽投稿頻道訊息 (自動攔截圖片並私訊管理員，保留原圖)
// ----------------------------------------------------
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (!db.targetChannelId || message.channel.id !== db.targetChannelId) return;

    const attachment = message.attachments.first();
    if (!attachment || !attachment.contentType || !attachment.contentType.startsWith('image/')) {
        return;
    }

    // (注意：此處已移除自動刪除原訊息的程式碼，圖片會正常留在頻道中)

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`approve_${message.author.id}_${Buffer.from(attachment.url).toString('base64')}`)
                .setLabel('是 (新增為貼圖)')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`reject_${message.author.id}`)
                .setLabel('否 (駁回)')
                .setStyle(ButtonStyle.Danger)
        );

    const embed = new EmbedBuilder()
        .setTitle('📢 新的貼圖投稿審核')
        .setDescription(`**投稿者：** ${message.author.tag} (<@${message.author.id}>)\n請選擇是否將此圖片新增為伺服器貼圖。`)
        .setImage(attachment.url)
        .setColor(0x3498DB);

    if (db.adminIds.length === 0) {
        console.log('⚠️ 尚未設定任何管理員，無法發送審核通知！');
        return;
    }

    // 私訊所有管理員
    for (const adminId of db.adminIds) {
        try {
            const adminUser = await client.users.fetch(adminId);
            if (adminUser) {
                await adminUser.send({
                    content: `來自伺服器 **${message.guild.name}** 的貼圖審核邀請：`,
                    embeds: [embed],
                    components: [row]
                });
            }
        } catch (err) {
            console.log(`無法私訊傳送審核通知給管理員 ID: ${adminId}`);
        }
    }

    // 告知投稿者已送出
    try {
        await message.author.send(`✅ 您的圖片已成功送出審核！管理員審核完畢後會再通知您。`);
    } catch (e) {}
});

// ----------------------------------------------------
// 監聽按鈕點擊事件 (審核動作與貼圖建立)
// ----------------------------------------------------
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    if (!db.adminIds.includes(interaction.user.id)) {
        return interaction.reply({ content: '❌ 您不是審核管理員，無法進行此操作！', ephemeral: true });
    }

    const [action, authorId, encodedUrl] = interaction.customId.split('_');

    if (action === 'approve') {
        const imageUrl = Buffer.from(encodedUrl, 'base64').toString('ascii');

        await interaction.update({ content: '⏳ 正在建立伺服器貼圖中...', embeds: [], components: [] });

        try {
            const stickerName = `sticker_${Date.now().toString().slice(-6)}`;
            
            const guild = interaction.client.guilds.cache.first(); 
            if (!guild) throw new Error('找不到對應的伺服器');

            // 建立伺服器貼圖
            const createdSticker = await guild.stickers.create({
                file: imageUrl,
                name: stickerName,
                tags: 'custom',
                description: `由 <@${authorId}> 投稿`
            });

            await interaction.editReply(`✅ 已成功新增貼圖！名稱：\`${createdSticker.name}\``);

            // 通知投稿者（包含投稿者名稱與直接展示生成好的貼圖）
            try {
                const authorUser = await client.users.fetch(authorId);
                await authorUser.send({
                    content: `🎉 **您的貼圖已成功新增！**\n**投稿者：** ${authorUser.tag} (<@${authorId}>)\n**生成的貼圖：**`,
                    stickers: [createdSticker]
                });
            } catch (e) {
                console.log('無法私訊通知投稿者');
            }

        } catch (error) {
            console.error('建立貼圖失敗：', error);
            await interaction.editReply(`❌ 建立貼圖失敗！請檢查圖片格式（需小於 512KB、PNG/JPEG）或伺服器貼圖空間是否已滿。`);
        }

    } else if (action === 'reject') {
        await interaction.update({ content: '❌ 已駁回此貼圖投稿。', embeds: [], components: [] });

        try {
            const authorUser = await client.users.fetch(authorId);
            await authorUser.send(`❌ 很抱歉，您投稿的圖片未被管理員批准。\n**投稿者：** <@${authorId}>`);
        } catch (e) {}
    }
});

// 登入機器人
client.login(process.env.DISCORD_TOKEN);
