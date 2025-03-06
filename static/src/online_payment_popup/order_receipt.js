import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";

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
