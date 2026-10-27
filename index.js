const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// ==========================================
// CẤU HÌNH THÔNG TIN (Thay bằng thông tin của bạn)
// ==========================================
const BANK_ID = 'TPBANK';
const ACCOUNT_NO = '98437888888';
const ACCOUNT_NAME = 'DUONG QUOC BAO';
const PREFIX = ".";

// CẤU HÌNH ZALO BOT (Lấy từ Zalo Bot Platform)
const ZALO_BOT_TOKEN = 'DAN_MA_BOT_TOKEN_VAO_DAY'; 
const ZALO_SECRET_TOKEN = 'duongquocbaono1Nscam1010'; // Như trên ảnh của bạn

// ==========================================
// DATABASE TẠM (Lưu số dư và đơn hàng)
// Lưu ý: Render Free khởi động lại sẽ mất dữ liệu này.
// ==========================================
const userBalances = {}; // { "uid_zalo": 50000 }
const pendingOrders = {}; // { "NAPuid_zalo": { chatId, senderUid, name, status } }

// ==========================================
// 1. WEBHOOK ZALO BOT (Zalo gọi vào đây khi có tin nhắn)
// ==========================================
app.post('/zalo-webhook', async (req, res) => {
    // Xác thực Secret Token để đảm bảo request này do Zalo gửi tới
    const secretHeader = req.headers['x-bot-api-secret-token'];
    if (secretHeader !== ZALO_SECRET_TOKEN) {
        return res.status(401).send('Unauthorized');
    }

    // Phải trả về 200 ngay lập tức để Zalo không gửi lại tin nhắn
    res.status(200).send('OK');

    try {
        const data = req.body;
        
        // Chỉ xử lý khi có tin nhắn văn bản mới
        if (data.event_name === 'message.text.received') {
            const text = data.message.text.trim();
            const chatId = data.message.chat.id;       // ID nhóm hoặc chat riêng
            const senderUid = data.message.from.id;    // UID người gửi
            const senderName = data.message.from.display_name;

            // Kiểm tra xem tin nhắn có bắt đầu bằng dấu chấm (.) không
            if (text.startsWith(PREFIX)) {
                const args = text.slice(PREFIX.length).trim().split(/\s+/);
                const command = args[0].toLowerCase();

                // ==========================================
                // LỆNH .NAP
                // ==========================================
                if (command === "nap") {
                    const orderCode = `NAP${senderUid}`;
                    
                    // Chống spam: Nếu đang có đơn chờ thì không tạo mới
                    if (pendingOrders[orderCode] && pendingOrders[orderCode].status === 'pending') {
                        await sendZaloMessage(chatId, `Bạn đang có đơn nạp chờ thanh toán. Vui lòng hoàn tất trước!`);
                        return;
                    }

                    // Lưu đơn vào danh sách chờ
                    pendingOrders[orderCode] = { 
                        chatId: chatId, 
                        senderUid: senderUid, 
                        name: senderName, 
                        status: 'pending' 
                    };
                    
                    // Tạo mã QR không có số tiền cố định
                    const qrUrl = `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact2.png?addInfo=${orderCode}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;

                    // Gửi ảnh QR và nội dung CK vào nhóm
                    await sendZaloPhoto(chatId, qrUrl, `Chào ${senderName}, vui lòng quét QR và tự nhập số tiền bạn muốn nạp.\nTuyệt đối giữ nguyên nội dung CK: ${orderCode}`);
                }

                // ==========================================
                // LỆNH .SODU
                // ==========================================
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
// 2. WEBHOOK SEPAY (SePay gọi vào đây khi có tiền vào tài khoản)
// ==========================================
app.post('/sepay-webhook', async (req, res) => {
    const content = req.body.content || '';
    const amountIn = req.body.transferAmount || 0; // Số tiền khách chuyển

    // Tìm đơn hàng có mã khớp với nội dung chuyển khoản
    const matchedOrderCode = Object.keys(pendingOrders).find(code => content.includes(code));

    if (matchedOrderCode && amountIn > 0) {
        const order = pendingOrders[matchedOrderCode];
        
        // 1. Cộng tiền vào tài khoản user
        const currentBalance = userBalances[order.senderUid] || 0;
        userBalances[order.senderUid] = currentBalance + amountIn;

        console.log(`=> Nhận tiền: ${order.name} (UID: ${order.senderUid}) nạp ${amountIn}đ`);

        // 2. Gửi thông báo thành công vào đúng nhóm Zalo
        await sendZaloMessage(order.chatId, `🎉 Chúc mừng ${order.name} đã nạp thành công ${Number(amountIn).toLocaleString('vi-VN')} VNĐ!`);

        // 3. Xóa đơn chờ để có thể tạo đơn mới
        delete pendingOrders[matchedOrderCode];
    }

    res.status(200).json({ success: true });
});

// ==========================================
// CÁC HÀM GỌI API ZALO BOT
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

// ==========================================
// KHỞI CHẠY SERVER
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Bot Server chạy ở port ${PORT}`);
});
