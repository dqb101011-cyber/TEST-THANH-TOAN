const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static('public')); // Chứa file HTML

// Lưu trữ tạm trên RAM (Khi test thì dùng cái này)
const orders = {}; 

// API 1: Tạo đơn hàng mới
app.post('/api/create-order', (req, res) => {
    const { username, amount } = req.body;
    
    // Random mã đơn hàng (Ví dụ: NAP83921)
    const orderCode = 'NAP' + Math.floor(Math.random() * 1000000);
    
    orders[orderCode] = {
        username: username,
        amount: amount,
        status: 'pending' // Đang chờ
    };

    // --- THÔNG TIN NGÂN HÀNG CỦA BẠN ĐÃ ĐƯỢC CẬP NHẬT ---
    const bankId = 'TPBANK'; 
    const accountNo = '98437888888'; // Đã bỏ khoảng trắng
    const accountName = 'DUONG QUOC BAO';
    
    // Tạo link QR động
    const qrUrl = `https://img.vietqr.io/image/${bankId}-${accountNo}-compact2.png?amount=${amount}&addInfo=${orderCode}&accountName=${encodeURIComponent(accountName)}`;

    res.json({
        success: true,
        orderCode: orderCode,
        qrUrl: qrUrl,
        accountName: accountName
    });
});

// API 2: Kiểm tra trạng thái đơn hàng
app.get('/api/check-status/:orderCode', (req, res) => {
    const orderCode = req.params.orderCode;
    const order = orders[orderCode];
    
    if (order) {
        res.json({ status: order.status, amount: order.amount, username: order.username });
    } else {
        res.status(404).json({ error: 'Không tìm thấy đơn' });
    }
});

// API 3: Nhận Webhook từ SePay
app.post('/sepay-webhook', (req, res) => {
    console.log('--- CÓ GIAO DỊCH TỪ SEPAY ---');
    
    // SePay trả về nội dung chuyển khoản trong trường content
    const content = req.body.content || '';
    
    // Tìm xem nội dung chuyển khoản có chứa mã đơn hàng nào không
    const matchedOrderCode = Object.keys(orders).find(code => content.includes(code));

    if (matchedOrderCode) {
        orders[matchedOrderCode].status = 'success';
        console.log(`=> Thành công: Đơn ${matchedOrderCode}`);
    }

    res.status(200).json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server chạy ở port ${PORT}`);
});
