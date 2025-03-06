import { Numpad } from "@point_of_sale/app/generic_components/numpad/numpad";
import { patch } from "@web/core/utils/patch";
patch(Numpad.prototype, {
  // setup() {
  //   if (!this.props.onClick) {
  //     this.numberBuffer = useService("custom_number_buffer");
  //     this.onClick = (buttonValue) => this.numberBuffer.sendKey(buttonValue);
  //   } else {
  //     this.onClick = this.props.onClick;
  //   }
  // },
});
