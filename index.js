const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// ==========================4398546430072574622:pkfqTpvLQsqErSvMkfIJCCGGEjAFrbhDCyEMrmBAXtJIwiXoPYLeNrcdEVJKQDKA===============
// CẤU HÌNH THÔNG TIN CỦA BẠN
// ==========================================
const BANK_ID = 'TPBANK';
const ACCOUNT_NO = '98437888888';
const ACCOUNT_NAME = 'DUONG QUOC BAO';
const PREFIX = ".";

// CẤU HÌNH ZALO BOT
const ZALO_BOT_TOKEN = '4398546430072574622:pkfqTpvLQsqErSvMkfIJCCGGEjAFrbhDCyEMrmBAXtJIwiXoPYLeNrcdEVJKQDKA'; // <-- Dán Token của bạn vào đây
const ZALO_SECRET_TOKEN = 'duongquocbaono1Nscam1010'; 

// Cấu hình URL của Render
const RENDER_URL = 'https://test-thanh-toan.onrender.com';

// ==========================================
// DATABASE TẠM
// ==========================================
const userBalances = {}; 
const pendingOrders = {}; 

// ==========================================
// 0. TỰ ĐỘNG ĐĂNG KÝ WEBHOOK VỚI ZALO
// ==========================================
async function setupWebhook() {
    try {
        const entrypoint = `https://bot-api.zaloplatforms.com/bot${ZALO_BOT_TOKEN}/setWebhook`;
        const response = await axios.post(entrypoint, {
            url: `${RENDER_URL}/zalo-webhook`,
            secret_token: ZALO_SECRET_TOKEN
        });

        if (response.data.ok) {
            console.log("✅ Đăng ký Webhook thành công!");
        } else {
            console.error("❌ Zalo từ chối đăng ký Webhook:", response.data);
        }
    } catch (error) {
        console.error("❌ Lỗi đăng ký Webhook:", error.response?.data || error.message);
    }
}

// ==========================================
// 1. WEBHOOK ZALO BOT (Nhận tin nhắn từ người dùng)
// ==========================================
app.post('/zalo-webhook', async (req, res) => {
    const secretHeader = req.headers['x-bot-api-secret-token'];
    if (secretHeader !== ZALO_SECRET_TOKEN) {
        return res.status(401).send('Unauthorized');
    }

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
// 2. WEBHOOK SEPAY (Nhận tiền chuyển khoản)
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
// CÁC HÀM GỬI TIN NHẮN QUA ZALO BOT API
// ==========================================
async function sendZaloMessage(chatId, text) {
    try {
        // Đã sửa lại đường dẫn API chuẩn có chữ /v1.0/
        const url = `https://bot-api.zaloplatforms.com/bot${ZALO_BOT_TOKEN}/v1.0/message/text`;
        
        console.log(`Đang gửi tin nhắn tới chatId: ${chatId}...`);
        
        const response = await axios.post(url, {
            chat_id: chatId,
            text: text
        });

        console.log("✅ Gửi tin nhắn thành công!", response.data);
    } catch (e) { 
        // In chi tiết lỗi từ Zalo ra để dễ sửa
        console.error("❌ Lỗi gửi text Zalo:", e.response?.data || e.message); 
    }
}

async function sendZaloPhoto(chatId, photoUrl, caption) {
    try {
        // Đã sửa lại đường dẫn API chuẩn có chữ /v1.0/
        const url = `https://bot-api.zaloplatforms.com/bot${ZALO_BOT_TOKEN}/v1.0/message/photo`;
        
        console.log(`Đang gửi ảnh QR tới chatId: ${chatId}...`);
        
        const response = await axios.post(url, {
            chat_id: chatId,
            photo: photoUrl, 
            caption: caption
        });

        console.log("✅ Gửi ảnh QR thành công!", response.data);
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
