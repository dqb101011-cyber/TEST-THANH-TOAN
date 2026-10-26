const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// ==========================================
// DATABASE TẠM (Lưu số dư và đơn hàng chờ)
// ==========================================
// Lưu số dư: { "uid_zalo_1": 50000, "uid_zalo_2": 100000 }
const userBalances = {}; 
// Lưu đơn chờ: { "NAPuid_zalo_1": { username: "Bao", status: "pending" } }
const pendingOrders = {}; 

// ==========================================
// CẤU HÌNH THÔNG TIN
// ==========================================
const BANK_ID = 'TPBANK';
const ACCOUNT_NO = '98437888888';
const ACCOUNT_NAME = 'DUONG QUOC BAO';

// ==========================================
// API 1: Bot Zalo gọi vào đây khi user gõ lệnh .nap
// ==========================================
app.post('/api/zalo-nap', (req, res) => {
    const { uid, username } = req.body;

    if (!uid) return res.status(400).json({ error: 'Thiếu UID' });

    const orderCode = `NAP${uid}`;
    
    // Nếu user đã có đơn đang chờ, không tạo thêm để tránh spam
    if (pendingOrders[orderCode] && pendingOrders[orderCode].status === 'pending') {
        return res.json({ 
            success: false, 
            message: `Bạn đang có đơn nạp chờ thanh toán. Vui lòng hoàn tất trước khi tạo đơn mới!` 
        });
    }

    pendingOrders[orderCode] = { uid, username, status: 'pending' };

    // Tạo QR không có số tiền
    const qrUrl = `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact2.png?addInfo=${orderCode}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;

    res.json({
        success: true,
        message: `Vui lòng quét mã QR và **tự nhập số tiền** bạn muốn nạp.\nTuyệt đối giữ nguyên nội dung chuyển khoản là: **${orderCode}**`,
        qrUrl: qrUrl
    });
});

// ==========================================
// API 2: Bot Zalo gọi vào đây khi user gõ lệnh .sodu
// ==========================================
app.post('/api/zalo-check-balance', (req, res) => {
    const { uid } = req.body;
    
    if (!uid) return res.status(400).json({ error: 'Thiếu UID' });

    // Lấy số dư, nếu chưa có thì mặc định là 0
    const balance = userBalances[uid] || 0;

    res.json({
        success: true,
        balance: balance,
        message: `Số dư hiện tại của bạn là: **${Number(balance).toLocaleString('vi-VN')} VNĐ**`
    });
});

// ==========================================
// API 3: SePay gọi vào đây khi có tiền vào
// ==========================================
app.post('/sepay-webhook', async (req, res) => {
    const content = req.body.content || '';
    const amountIn = req.body.transferAmount || 0; // Số tiền khách chuyển

    // Tìm đơn hàng khớp với nội dung
    const matchedOrderCode = Object.keys(pendingOrders).find(code => content.includes(code));

    if (matchedOrderCode && amountIn > 0) {
        const order = pendingOrders[matchedOrderCode];
        
        // 1. CỘNG TIỀN VÀO TÀI KHOẢN CỦA USER
        const currentBalance = userBalances[order.uid] || 0;
        userBalances[order.uid] = currentBalance + amountIn;

        // 2. Báo cáo kết quả
        console.log(`=> Nạp thành công: UID ${order.uid} | +${amountIn}đ | Số dư mới: ${userBalances[order.uid]}đ`);

        // 3. Gửi tin nhắn thông báo vào Group Zalo (Gọi hàm giả lập)
        await sendZaloMessage(`Chúc mừng **${order.username}** đã nạp thành công **${Number(amountIn).toLocaleString('vi-VN')} VNĐ** vào tài khoản!`);

        // 4. Xóa đơn chờ
        delete pendingOrders[matchedOrderCode];
    }

    res.status(200).json({ success: true });
});

// Hàm gửi tin nhắn Zalo (Giả lập)
async function sendZaloMessage(text) {
    console.log(`[GỬI ZALO VÀO GROUP]: ${text}`);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server chạy ở port ${PORT}`);
});
