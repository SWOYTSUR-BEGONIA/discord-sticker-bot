const { 
    Client, 
    GatewayIntentBits, 
    Partials, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder 
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// =====================
// 在這裡設定你的參數
// =====================
const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID || '請填入投稿頻道ID';
const ADMIN_ROLE_OR_USER_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',') : ['請填入管理員ID1', '請填入管理員ID2'];

client.once('ready', () => {
    console.log(`機器人已成功登入：${client.user.tag}`);
});

// 監聽訊息
client.on('messageCreate', async (message) => {
    // 忽略機器人自身的訊息
    if (message.author.bot) return;

    // 檢查是否為指定的投稿頻道
    if (message.channel.id !== TARGET_CHANNEL_ID) return;

    // 檢查是否有附帶圖片
    const attachment = message.attachments.first();
    if (!attachment || !attachment.contentType || !attachment.contentType.startsWith('image/')) {
        return;
    }

    // 刪除用戶在公開頻道的原訊息保持版面乾淨（選用，若想保留可註解掉下面這行）
    try {
        await message.delete();
    } catch (e) {
        console.log('無法刪除原訊息，可能缺少權限');
    }

    // 建立審核按鈕
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`approve_${message.author.id}_${Buffer.from(attachment.url).toString('base64')}`)
                .setLabel('是 (同意上架)')
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
        .setColor(0x00AE86);

    // 尋找伺服器中擁有管理員權限的人，或者透過指定 ID 私訊發送審核通知
    // 為了確保只有管理員看到，我們發送給伺服器內擁有 Administrator 權限的人或是指定的 Admin 清單
    try {
        const guild = message.guild;
        const members = await guild.members.fetch();
        
        // 過濾出管理員（擁有管理員權限或是符合設定的 Admin ID）
        const admins = members.filter(member => {
            if (member.user.bot) return false;
            const isAdminRole = member.permissions.has('Administrator');
            const isSpecificAdmin = ADMIN_OR_USER_MATCH(member.id);
            return isAdminRole || isSpecificAdmin;
        });

        if (admins.size === 0) {
            console.log('找不到任何管理員可發送審核通知！');
            return;
        }

        // 逐一私訊管理員審核請求
        for (const [adminId, adminMember] of admins) {
            try {
                await adminMember.send({
                    content: `來自 **${guild.name}** 的貼圖審核：`,
                    embeds: [embed],
                    components: [row]
                });
            } catch (err) {
                // 部分管理員可能關閉了私訊，略過錯誤
                console.log(`無法私訊管理員 ${adminMember.user.tag}`);
            }
        }

        // 通知投稿者已成功送出審核
        try {
            await message.author.send(`✅ 您的圖片已成功送出審核，管理員審核完畢後將會通知您！`);
        } catch (e) {
            // 用戶可能關閉私訊
        }

    } catch (error) {
        console.error('處理投稿時發生錯誤：', error);
    }
});

// 輔助檢查是否為指定管理員
function ADMIN_OR_USER_MATCH(userId) {
    return ADMIN_ROLE_OR_USER_IDS.includes(userId);
}

// 監聽按鈕點擊事件
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const [action, authorId, encodedUrl] = interaction.customId.split('_');

    // 檢查點擊按鈕的人是否為管理員
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const isAdmin = member && (member.permissions.has('Administrator') || ADMIN_OR_USER_MATCH(interaction.user.id));

    if (!isAdmin) {
        return interaction.reply({ content: '❌ 您沒有權限進行此操作！', ephemeral: true });
    }

    if (action === 'approve') {
        const imageUrl = Buffer.from(encodedUrl, 'base64').toString('ascii');
        
        await interaction.update({ content: '⏳ 正在建立貼圖並上架中...', embeds: [], components: [] });

        try {
            // 建立伺服器貼圖
            const guild = interaction.guild;
            const stickerName = `sticker_${Date.now().toString().slice(-6)}`; // 自動產生不重複的貼圖名稱
            
            const createdSticker = await guild.stickers.create({
                file: imageUrl,
                name: stickerName,
                tags: 'custom_sticker',
                description: `由用戶 <@${authorId}> 投稿`
            });

            await interaction.editReply(`✅ 已成功將圖片生成為伺服器貼圖！名稱：\`${stickerName}\``);

            // 通知投稿者成功
            try {
                const authorUser = await client.users.fetch(authorId);
                await authorUser.send(`🎉 恭喜！您投稿的圖片已被管理員批准，並成功設置為伺服器貼圖！\n**投稿者：** <@${authorId}>\n**生成貼圖：** ${createdSticker}`);
            } catch (e) {
                console.log('無法私訊通知投稿者');
            }

        } catch (error) {
            console.error('建立貼圖失敗：', error);
            await interaction.editReply(`❌ 建立貼圖失敗，可能是因為貼圖名額已滿或圖片格式不符（需小於 512KB 且為 PNG/APNG/JPEG）。`);
        }

    } else if (action === 'reject') {
        await interaction.update({ content: '❌ 已經成功駁回此貼圖投稿。', embeds: [], components: [] });

        // 通知投稿者被駁回
        try {
            const authorUser = await client.users.fetch(authorId);
            await authorUser.send(`❌ 很遺憾，您投稿的圖片未被管理員批准（已被駁回）。\n**投稿者：** <@${authorId}>`);
        } catch (e) {
            console.log('無法私訊通知投稿者');
        }
    }
});

// 登入機器人
client.login(process.env.DISCORD_TOKEN);