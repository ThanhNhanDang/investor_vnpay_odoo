import { useState, onMounted, onWillUnmount, onWillStart } from "@odoo/owl";
import { OnlinePaymentPopup } from "@pos_online_payment/app/online_payment_popup/online_payment_popup";
import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";

// Patch để thêm props mới
patch(OnlinePaymentPopup, {
  props: {
    ...OnlinePaymentPopup.props, // Giữ nguyên props cũ
    expDate: { type: String, optional: true }, // Thời gian hết hạn (yyMMddHHmm)
    displayExpTime: { type: String, optional: true }, // Thời gian hiển thị ban đầu (HH:mm)
  },
});

// Patch prototype để thêm logic đếm ngược
patch(OnlinePaymentPopup.prototype, {
  setup() {
    super.setup(...arguments);
    this.webSocket = useService("webSocket");
    onWillStart(async () => {
      this.webSocket.onMessage(this.handleWebSocketMessage.bind(this));
    });
    // State để lưu thời gian đếm ngược
    this.state = useState({ countdown: "15:00" });
    this.countdownInterval = null;

    // Hàm định dạng thời gian còn lại (mm:ss)
    const formatTime = (seconds) => {
      const minutesLeft = Math.floor(seconds / 60);
      const secondsLeft = seconds % 60;
      return `${String(minutesLeft).padStart(2, "0")}:${String(
        secondsLeft
      ).padStart(2, "0")}`;
    };


    // Lifecycle hook: Khi component được mount
    onMounted(async () => {
      let timeLeft = 15 * 60; // 15 phút = 900 giây
      timeLeft -= 1;
      // Cập nhật đếm ngược mỗi giây
      this.countdownInterval = setInterval(() => {
        if (timeLeft <= 0) {
          clearInterval(this.countdownInterval);
          this.state.countdown = "00:00";
          this.props.close(); // Đóng popup khi hết thời gian
          return;
        }
        this.state.countdown = formatTime(timeLeft); // Định dạng thời gian
        timeLeft -= 1; // Giảm 1 giây
      }, 1000);
      try {
        const os = this.checkOperatingSystem()
        if (os === 'Windows') {
          console.log("Đang chạy trên Windows");
          return;
        }
        else if (os === 'Android') {
          const dialogElement = document.getElementById("qr-code-container"); // Chọn phần tử Dialog
          if (!dialogElement) {
            console.error("Không tìm thấy element Dialog");
            return;
          }

          // Sử dụng html2canvas để chụp màn hình
          const canvas = await html2canvas(dialogElement, {
            scale: 2, // Tăng độ phân giải
            useCORS: true, // Hỗ trợ tải hình ảnh từ URL khác
          });
          // Chuyển canvas thành ảnh PNG
          const imgData = canvas
            .toDataURL("image/jpeg")
            .replace("data:image/jpeg;base64,", "");
          // Tạo link tải ảnh
          if (this.webSocket.isConnect() == 1) {
            this.webSocket.send(
              JSON.stringify({
                type: "PRINT_RECEIPT",
                image: imgData,
              })
            );
          }
        }
      } catch (error) {
        console.error("Lỗi khi chụp màn hình:", error);
      }
    });




    // Lifecycle hook: Khi component bị unmount
    onWillUnmount(() => {
      if (this.countdownInterval) {
        clearInterval(this.countdownInterval); // Dọn dẹp interval
      }
    });

    // Gán giá trị mặc định
    this.expDate = this.props.expDate || "";
    this.displayExpTime = this.props.displayExpTime || "";
  },
  checkOperatingSystem() {
    return 'Android';

    // const userAgent = navigator.userAgent.toLowerCase();
    // if (/windows/.test(userAgent)) {
    //   return 'Windows';
    // } else if (/android/.test(userAgent)) {
    //   return 'Android';
    // } else {
    //   return 'Unknown';
    // }
  },
  async handleWebSocketMessage(e) {
    try {
      console.log(e);
    } catch (error) {
      console.log(error);
    }
  },
});
