const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// ==========================================
// CẤU HÌNH THÔNG TIN CỦA BẠN
// ==========================================
const BANK_ID = 'TPBANK';
const ACCOUNT_NO = '98437888888';
const ACCOUNT_NAME = 'DUONG QUOC BAO';
const PREFIX = ".";

// CẤU HÌNH ZALO BOT
const ZALO_BOT_TOKEN = '4398546430072574622:pkfqTpvLQsqErSvMkfIJCCGGEjAFrbhDCyEMrmBAXtJIwiXoPYLeNrcdEVJKQDKA'; // <-- Thay Token của bạn vào đây
const ZALO_SECRET_TOKEN = 'duongquocbaono1Nscam1010'; 

// Cấu hình URL của Render
const RENDER_URL = 'https://test-thanh-toan.onrender.com';

// ==========================================
// DATABASE TẠM
// ==========================================
const userBalances = {}; 
const pendingOrders = {}; 

// ==========================================
// 0. TỰ ĐỘNG ĐĂNG KÝ WEBHOOK
// ==========================================
async function setupWebhook() {
    try {
        const entrypoint = `https://bot-api.zaloplatforms.com/bot${ZALO_BOT_TOKEN}/setWebhook`;
        const response = await axios.post(entrypoint, {
            url: `${RENDER_URL}/zalo-webhook`,
            secret_token: ZALO_SECRET_TOKEN
        });
        if (response.data.ok) console.log("✅ Đăng ký Webhook thành công!");
    } catch (error) {
        console.error("❌ Lỗi đăng ký Webhook:", error.response?.data || error.message);
    }
}

// ==========================================
// 1. WEBHOOK ZALO BOT (Nhận tin nhắn)
// ==========================================
app.post('/zalo-webhook', async (req, res) => {
    const secretHeader = req.headers['x-bot-api-secret-token'];
    if (secretHeader !== ZALO_SECRET_TOKEN) return res.status(401).send('Unauthorized');

    res.status(200).send('OK'); // Trả lời Zalo ngay

    try {
        const data = req.body;
        
        if (data.event_name === 'message.text.received') {
            const text = data.message.text.trim();
            const chatId = data.message.chat.id;       
            const senderUid = data.message.from.id;    
            const senderName = data.message.from.display_name || "Khách";

            console.log(`[TIN NHẮN MỚI] ${senderName}: ${text}`);

            if (text.startsWith(PREFIX)) {
                const args = text.slice(PREFIX.length).trim().split(/\s+/);
                const command = args[0].toLowerCase();

                // Lệnh .nap
                if (command === "nap") {
                    const orderCode = `NAP${senderUid}`;
                    
                    if (pendingOrders[orderCode]) {
                        return await sendZaloMessage(chatId, `Bạn đang có đơn nạp chờ thanh toán. Vui lòng hoàn tất!`);
                    }

                    pendingOrders[orderCode] = { chatId, senderUid, name: senderName, status: 'pending' };
                    const qrUrl = `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact2.png?addInfo=${orderCode}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;

                    await sendZaloPhoto(chatId, qrUrl, `Chào ${senderName}, vui lòng quét QR và tự nhập số tiền bạn muốn nạp.\nTuyệt đối giữ nguyên nội dung CK: ${orderCode}`);
                }

                // Lệnh .sodu
                if (command === "sodu") {
                    const balance = userBalances[senderUid] || 0;
                    await sendZaloMessage(chatId, `Số dư của ${senderName} hiện tại là: ${Number(balance).toLocaleString('vi-VN')} VNĐ`);
                }
            }
        }
    } catch (error) {
        console.error('Lỗi xử lý Zalo Webhook:', error);
    }
});

// ==========================================
// 2. WEBHOOK SEPAY (Nhận tiền)
// ==========================================
app.post('/sepay-webhook', async (req, res) => {
    const content = req.body.content || '';
    const amountIn = req.body.transferAmount || 0;

    const matchedOrderCode = Object.keys(pendingOrders).find(code => content.includes(code));

    if (matchedOrderCode && amountIn > 0) {
        const order = pendingOrders[matchedOrderCode];
        userBalances[order.senderUid] = (userBalances[order.senderUid] || 0) + amountIn;

        await sendZaloMessage(order.chatId, `🎉 Chúc mừng ${order.name} đã nạp thành công ${Number(amountIn).toLocaleString('vi-VN')} VNĐ!`);
        delete pendingOrders[matchedOrderCode];
    }

    res.status(200).json({ success: true });
});

// ==========================================
// CÁC HÀM GỬI TIN NHẮN (ĐÃ SỬA ĐƯỜNG DẪN CHUẨN)
// ==========================================
async function sendZaloMessage(chatId, text) {
    try {
        // ĐƯỜNG DẪN ĐÃ BỎ /v1.0
        const url = `https://bot-api.zaloplatforms.com/bot${ZALO_BOT_TOKEN}/message/text`;
        
        const response = await axios.post(url, {
            chat_id: chatId,
            text: text
        });

        // Kiểm tra kỹ response trả về
        if (response.data && response.data.ok) {
            console.log("✅ Gửi text thành công!");
        } else {
            console.error("❌ Zalo trả về lỗi khi gửi text:", response.data);
        }
    } catch (e) { 
        console.error("❌ Lỗi gửi text Zalo:", e.response?.data || e.message); 
    }
}

async function sendZaloPhoto(chatId, photoUrl, caption) {
    try {
        // ĐƯỜNG DẪN ĐÃ BỎ /v1.0
        const url = `https://bot-api.zaloplatforms.com/bot${ZALO_BOT_TOKEN}/message/photo`;
        
        const response = await axios.post(url, {
            chat_id: chatId,
            photo: photoUrl, 
            caption: caption
        });

        if (response.data && response.data.ok) {
            console.log("✅ Gửi ảnh thành công!");
        } else {
            console.error("❌ Zalo trả về lỗi khi gửi ảnh:", response.data);
        }
    } catch (e) { 
        console.error("❌ Lỗi gửi ảnh Zalo:", e.response?.data || e.message); 
    }
}

// ==========================================
// KHỞI CHẠY SERVER
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Bot Server chạy ở port ${PORT}`);
    setupWebhook();
});
