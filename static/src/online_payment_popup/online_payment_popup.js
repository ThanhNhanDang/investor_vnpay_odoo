import { useState, onMounted, onWillUnmount } from "@odoo/owl";
import { OnlinePaymentPopup } from "@pos_online_payment/app/online_payment_popup/online_payment_popup";
import { patch } from "@web/core/utils/patch";

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

    // State để lưu thời gian đếm ngược
    this.state = useState({ countdown: "15:00" });
    this.countdownInterval = null;

    // Hàm định dạng thời gian còn lại (mm:ss)
    const formatTime = (seconds) => {
      const minutesLeft = Math.floor(seconds / 60);
      const secondsLeft = seconds % 60;
      return `${String(minutesLeft).padStart(2, "0")}:${String(secondsLeft).padStart(2, "0")}`;
    };

    // Lifecycle hook: Khi component được mount
    onMounted(() => {
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
});