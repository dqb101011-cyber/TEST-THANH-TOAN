const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static('public')); // Chứa file HTML

// Lưu trữ tạm trên RAM (Khi test thì dùng cái này, chạy thật thì phải dùng Database)
const orders = {}; 

// API 1: Tạo đơn hàng mới
app.post('/api/create-order', (req, res) => {
    const { username, amount } = req.body;
    
    // Random mã đơn hàng (Ví dụ: NAP83921)
    const orderCode = 'NAP' + Math.floor(Math.random() * 1000000);
    
    // Lưu vào bộ nhớ
    orders[orderCode] = {
        username: username,
        amount: amount,
        status: 'pending' // Đang chờ
    };

    // Tạo link QR (Dùng API của VietQR, cực dễ, không cần cấu hình SePay API)
    // Lưu ý: Thay MBBANK và SỐ_TÀI_KHOẢN bằng thông tin thật của bạn
    const bankId = 'MBBANK'; 
    const accountNo = '0123456789'; 
    const accountName = 'NGUYEN VAN A';
    const qrUrl = `https://img.vietqr.io/image/${bankId}-${accountNo}-compact2.png?amount=${amount}&addInfo=${orderCode}&accountName=${encodeURIComponent(accountName)}`;

    res.json({
        success: true,
        orderCode: orderCode,
        qrUrl: qrUrl
    });
});

// API 2: Kiểm tra trạng thái đơn hàng (Frontend sẽ gọi liên tục)
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
    console.log(req.body);

    // Lấy nội dung chuyển khoản (SePay trả về trong trường content hoặc description)
    const content = req.body.content || req.body.description || '';
    
    // Kiểm tra xem nội dung có chứa mã đơn hàng của mình không
    const matchedOrderCode = Object.keys(orders).find(code => content.includes(code));

    if (matchedOrderCode) {
        orders[matchedOrderCode].status = 'success';
        console.log(`=> Đã cộng tiền thành công cho đơn: ${matchedOrderCode}`);
    }

    // Phải trả về 200 để SePay biết đã nhận
    res.status(200).json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server chạy ở port ${PORT}`);
});
