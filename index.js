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
const ZALO_BOT_TOKEN = '4398546430072574622:pkfqTpvLQsqErSvMkfIJCCGGEjAFrbhDCyEMrmBAXtJIwiXoPYLeNrcdEVJKQDKA'; 
const ZALO_SECRET_TOKEN = 'duongquocbaono1Nscam1010'; 

// CẤU HÌNH IMGBB (Đã lấy API Key của bạn)
const IMGBB_API_KEY = 'f333aa75c1397c8efa8e9a15ddbe86e4';

// CẤU HÌNH ĐƯỜNG DẪN CƠ SỞ
const BASE_URL = `https://bot-api.zaloplatforms.com/bot${ZALO_BOT_TOKEN}`;
const RENDER_URL = 'https://test-thanh-toan.onrender.com';

// DATABASE TẠM
const userBalances = {}; 
const pendingOrders = {}; 

// ==========================================
// 0. TỰ ĐỘNG ĐĂNG KÝ WEBHOOK
// ==========================================
async function setupWebhook() {
    try {
        const entrypoint = `${BASE_URL}/setWebhook`;
        const response = await axios.post(entrypoint, {
            url: `${RENDER_URL}/webhook`, 
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
app.post('/webhook', async (req, res) => { 
    const secretHeader = req.headers['x-bot-api-secret-token'];
    if (secretHeader !== ZALO_SECRET_TOKEN) return res.status(401).send('Unauthorized');

    res.status(200).send('OK'); 

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
                    pendingOrders[orderCode] = { chatId, senderUid, name: senderName, status: 'pending' };
                    
                    const qrUrl = `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact2.png?addInfo=${orderCode}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;

                    await sendPhotoViaImgBB(chatId, qrUrl, `Chào ${senderName}, vui lòng quét QR và tự nhập số tiền bạn muốn nạp.\nTuyệt đối giữ nguyên nội dung CK: ${orderCode}`);
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
// HÀM GỬI TEXT
// ==========================================
async function sendMessage(chatId, text) {
    try {
        await axios.post(`${BASE_URL}/sendMessage`, { 
            chat_id: chatId, 
            text: text 
        });
        console.log(`✅ Đã gửi text tới ${chatId}`);
    } catch (err) {
        console.error('❌ Lỗi gửi text Zalo:', err.response ? err.response.data : err.message);
    }
}

// ==========================================
// HÀM GỬI ẢNH QUA IMGBB (CHUẨN XÁC)
// ==========================================
async function sendPhotoViaImgBB(chatId, qrUrl, caption) {
    try {
        console.log(`⏳ Đang tải ảnh QR từ VietQR...`);
        
        // 1. Tải ảnh từ link VietQR về dưới dạng Buffer
        const imageResponse = await axios.get(qrUrl, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(imageResponse.data, 'binary');
        
        // 2. Chuyển sang Base64 và Upload lên ImgBB
        const imageBase64 = imageBuffer.toString('base64');
        console.log(`⏳ Đang upload ảnh lên ImgBB...`);
        
        const form = new URLSearchParams();
        form.append('key', IMGBB_API_KEY);
        form.append('image', imageBase64);

        const uploadRes = await axios.post('https://api.imgbb.com/1/upload', form.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        if (!uploadRes.data.success) {
            throw new Error("Up ảnh ImgBB thất bại!");
        }
        
        const cleanImageUrl = uploadRes.data.data.url;
        console.log(`✅ Đã có link ảnh sạch: ${cleanImageUrl}`);

        // 3. Gửi link ảnh cho Zalo Bot
        console.log(`⏳ Đang gửi ảnh lên Zalo...`);
        const zaloRes = await axios.post(`${BASE_URL}/sendPhoto`, {
            chat_id: chatId,
            photo: cleanImageUrl,
            caption: caption
        });

        if (zaloRes.data.ok) {
            console.log(`✅ Đã gửi ảnh QR tới ${chatId} thành công!`);
        } else {
            console.error(`❌ Zalo báo lỗi gửi ảnh:`, zaloRes.data);
        }

    } catch (err) {
        console.error('❌ LỖI GỬI ẢNH:', err.response ? err.response.data : err.message);
        
        // Nếu gửi ảnh lỗi, nhắn tin văn bản cho người dùng
        await sendMessage(chatId, `⚠️ Không thể gửi ảnh QR. Vui lòng chuyển khoản thủ công:\nNgân hàng: ${BANK_ID}\nSố TK: ${ACCOUNT_NO}\nTên: ${ACCOUNT_NAME}\nNội dung: BẮT BUỘC ĐIỀN ĐÚNG MÃ NÀY`);
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
