import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";
import { useState, onMounted, onWillUnmount, onWillStart } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

import { patch } from "@web/core/utils/patch";
patch(OrderReceipt, {
  template: "custom_point_of_sale.OrderReceipt",
  // setup() {
  //   if (!this.props.onClick) {
  //     this.numberBuffer = useService("custom_number_buffer");
  //     this.onClick = (buttonValue) => this.numberBuffer.sendKey(buttonValue);
  //   } else {
  //     this.onClick = this.props.onClick;
  //   }
  // },
});
patch(OrderReceipt.prototype, {
  setup() {
    super.setup(...arguments);
    this.webSocket = useService("webSocket");
    onWillStart(async () => {
      this.webSocket.onMessage(this.handleWebSocketMessage.bind(this));
    });
    onMounted(async () => {
      try {
        const os = this.checkOperatingSystem()
        if (os === 'Windows') {
          console.log("Đang chạy trên Windows");
          return;
        }
        else if (os === 'Android') {
          const dialogElement = document.getElementById("order-receipt-custom"); // Chọn phần tử Dialog
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

          console.log("Ảnh đã được tải xuống!");
        }
      } catch (error) {
        console.error("Lỗi khi chụp màn hình:", error);
      }
    });
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
