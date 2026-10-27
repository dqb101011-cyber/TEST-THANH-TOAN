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
const ZALO_BOT_TOKEN = 'DAN_MA_BOT_TOKEN_MOI_VAO_DAY'; // <-- Dán Token của bạn vào đây
const ZALO_SECRET_TOKEN = 'duongquocbaono1Nscam1010'; 

// ĐƯỜNG DẪN CƠ SỞ THEO CHUẨN FILE MẪU
const BASE_URL = `https://bot-api.zaloplatforms.com/bot${ZALO_BOT_TOKEN}`;
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
        const entrypoint = `${BASE_URL}/setWebhook`;
        const response = await axios.post(entrypoint, {
            url: `${RENDER_URL}/webhook`, // SỬA THÀNH /webhook CHO KHỚP VỚI BÊN DƯỚI
            secret_token: ZALO_SECRET_TOKEN
        });
        if (response.data.ok) console.log("✅ Đăng ký Webhook thành công!");
        else console.error("❌ Zalo từ chối:", response.data);
    } catch (error) {
        console.error("❌ Lỗi đăng ký Webhook:", error.response?.data || error.message);
    }
}

// ==========================================
// 1. WEBHOOK ZALO BOT (Nhận tin nhắn)
// ==========================================
app.post('/webhook', async (req, res) => { // SỬA THÀNH /webhook
    const secretHeader = req.headers['x-bot-api-secret-token'];
    if (secretHeader !== ZALO_SECRET_TOKEN) return res.status(401).send('Unauthorized');

    res.status(200).send('OK'); // Trả lời Zalo ngay

    try {
        const data = req.body;
        
        // Cấu trúc dữ liệu chuẩn của Zalo Bot API
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
                        return await sendMessage(chatId, `Bạn đang có đơn nạp chờ thanh toán. Vui lòng hoàn tất!`);
                    }

                    pendingOrders[orderCode] = { chatId, senderUid, name: senderName, status: 'pending' };
                    const qrUrl = `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact2.png?addInfo=${orderCode}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;

                    await sendPhoto(chatId, qrUrl, `Chào ${senderName}, vui lòng quét QR và tự nhập số tiền bạn muốn nạp.\nTuyệt đối giữ nguyên nội dung CK: ${orderCode}`);
                }

                // Lệnh .sodu
                if (command === "sodu") {
                    const balance = userBalances[senderUid] || 0;
                    await sendMessage(chatId, `Số dư của ${senderName} hiện tại là: ${Number(balance).toLocaleString('vi-VN')} VNĐ`);
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

        await sendMessage(order.chatId, `🎉 Chúc mừng ${order.name} đã nạp thành công ${Number(amountIn).toLocaleString('vi-VN')} VNĐ!`);
        delete pendingOrders[matchedOrderCode];
    }

    res.status(200).json({ success: true });
});

// ==========================================
// CÁC HÀM GỬI TIN NHẮN (SỬA THEO ĐÚNG FILE MẪU)
// ==========================================
async function sendMessage(chatId, text) {
    try {
        // Dùng BASE_URL chuẩn và endpoint /sendMessage
        await axios.post(`${BASE_URL}/sendMessage`, { 
            chat_id: chatId, 
            text: text 
        });
        console.log(`✅ Đã gửi tin nhắn tới ${chatId}`);
    } catch (err) {
        console.error('❌ Lỗi gửi tin nhắn:', err.response ? err.response.data : err.message);
    }
}

async function sendPhoto(chatId, photoUrl, caption) {
    try {
        // Dùng BASE_URL chuẩn và endpoint /sendPhoto
        await axios.post(`${BASE_URL}/sendPhoto`, { 
            chat_id: chatId, 
            photo: photoUrl, 
            caption: caption || '' 
        });
        console.log(`✅ Đã gửi ảnh tới ${chatId}`);
    } catch (err) {
        console.error('❌ Lỗi gửi ảnh:', err.response ? err.response.data : err.message);
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
