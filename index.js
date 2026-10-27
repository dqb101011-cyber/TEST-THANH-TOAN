const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// ==========================================
// CẤU HÌNH THÔNG TIN
// ==========================================
const BANK_ID = 'TPBANK';
const ACCOUNT_NO = '98437888888';
const ACCOUNT_NAME = 'DUONG QUOC BAO';
const PREFIX = ".";

// CẤU HÌNH ZALO BOT
const ZALO_BOT_TOKEN = '4398546430072574622:pkfqTpvLQsqErSvMkfIJCCGGEjAFrbhDCyEMrmBAXtJIwiXoPYLeNrcdEVJKQDKA'; // Dán Token mới sau khi Reset
const ZALO_SECRET_TOKEN = 'duongquocbaono1Nscam1010'; 

const userBalances = {}; 
const pendingOrders = {}; 

// ==========================================
// WEBHOOK ZALO BOT (Đã sửa cấu trúc JSON chuẩn)
// ==========================================
app.post('/zalo-webhook', async (req, res) => {
    // Xác thực Secret Token
    const secretHeader = req.headers['x-bot-api-secret-token'];
    if (secretHeader !== ZALO_SECRET_TOKEN) {
        return res.status(401).send('Unauthorized');
    }

    // Phải trả về 200 ngay
    res.status(200).send('OK');

    try {
        const data = req.body;
        
        // SỬA LỖI TẠI ĐÂY: Cấu trúc của Zalo Bot API
        if (data.event_name === 'message.text.received') {
            const text = data.message.text.trim();
            const chatId = data.message.chat.id;       
            const senderUid = data.message.from.id;    
            const senderName = data.message.from.display_name || "Khách";

            if (text.startsWith(PREFIX)) {
                const args = text.slice(PREFIX.length).trim().split(/\s+/);
                const command = args[0].toLowerCase();

                if (command === "nap") {
                    const orderCode = `NAP${senderUid}`;
                    
                    if (pendingOrders[orderCode] && pendingOrders[orderCode].status === 'pending') {
                        await sendZaloMessage(chatId, `Bạn đang có đơn nạp chờ thanh toán. Vui lòng hoàn tất trước!`);
                        return;
                    }

                    pendingOrders[orderCode] = { 
                        chatId: chatId, 
                        senderUid: senderUid, 
                        name: senderName, 
                        status: 'pending' 
                    };
                    
                    const qrUrl = `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact2.png?addInfo=${orderCode}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;

                    await sendZaloPhoto(chatId, qrUrl, `Chào ${senderName}, vui lòng quét QR và tự nhập số tiền bạn muốn nạp.\nTuyệt đối giữ nguyên nội dung CK: ${orderCode}`);
                }

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
// WEBHOOK SEPAY
// ==========================================
app.post('/sepay-webhook', async (req, res) => {
    const content = req.body.content || '';
    const amountIn = req.body.transferAmount || 0;

    const matchedOrderCode = Object.keys(pendingOrders).find(code => content.includes(code));

    if (matchedOrderCode && amountIn > 0) {
        const order = pendingOrders[matchedOrderCode];
        
        const currentBalance = userBalances[order.senderUid] || 0;
        userBalances[order.senderUid] = currentBalance + amountIn;

        await sendZaloMessage(order.chatId, `🎉 Chúc mừng ${order.name} đã nạp thành công ${Number(amountIn).toLocaleString('vi-VN')} VNĐ!`);
        delete pendingOrders[matchedOrderCode];
    }

    res.status(200).json({ success: true });
});

// ==========================================
// CÁC HÀM GỬI TIN NHẮN
// ==========================================
async function sendZaloMessage(chatId, text) {
    try {
        await axios.post('https://bot-api.zaloplatforms.com/bot/v1/message/text', {
            chat_id: chatId,
            text: text
        }, {
            headers: { 'Authorization': `Bearer ${ZALO_BOT_TOKEN}` }
        });
    } catch (e) { 
        console.error("Lỗi gửi text Zalo:", e.response?.data || e.message); 
    }
}

async function sendZaloPhoto(chatId, photoUrl, caption) {
    try {
        await axios.post('https://bot-api.zaloplatforms.com/bot/v1/message/photo', {
            chat_id: chatId,
            photo: photoUrl, 
            caption: caption
        }, {
            headers: { 'Authorization': `Bearer ${ZALO_BOT_TOKEN}` }
        });
    } catch (e) { 
        console.error("Lỗi gửi ảnh Zalo:", e.response?.data || e.message); 
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Bot Server chạy ở port ${PORT}`);
});
