/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { useBarcodeReader } from "@point_of_sale/app/barcode/barcode_reader_hook";
import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
import { onMounted, useState } from "@odoo/owl";
import {
  BACKSPACE,
  DEFAULT_LAST_ROW,
} from "@point_of_sale/app/generic_components/numpad/numpad";

export function getButtons(lastRow, rightColumn) {
  return [
    { value: "C" },
    { value: " + " },
    { value: " - " },
    ...(rightColumn ? [rightColumn[0]] : []),
    { value: "1" },
    { value: "2" },
    { value: "3" },
    ...(rightColumn ? [rightColumn[1]] : []),
    { value: "4" },
    { value: "5" },
    { value: "6" },
    ...(rightColumn ? [rightColumn[2]] : []),
    { value: "7" },
    { value: "8" },
    { value: "9" },
    ...(rightColumn ? [rightColumn[3]] : []),
    ...lastRow,
    ...[],
  ];
}
patch(ProductScreen.prototype, {
  setup() {
    super.setup(...arguments);
    this.numberBuffer = useService("custom_number_buffer");
    onMounted(() => {
      this.pos.openOpeningControl();
      this.pos.addPendingOrder([this.currentOrder.id]);
      // Call `reset` when the `onMounted` callback in `numberBuffer.use` is done.
      // We don't do this in the `mounted` lifecycle method because it is called before
      // the callbacks in `onMounted` hook.
      this.numberBuffer.reset();
    });
    this.numberBuffer.use({
      useWithBarcode: true,
    });
  },
  onNumpadClick(buttonValue) {
    if (["quantity", "discount", "price"].includes(buttonValue)) {
      this.numberBuffer.capture();
      this.numberBuffer.reset();
      this.pos.numpadMode = buttonValue;
      return;
    }
    if (buttonValue === " + " || buttonValue === " - ") {
      this.pos.numpadMode = buttonValue;
    }
    this.numberBuffer.sendKey(buttonValue);
  },
  getNumpadButtons() {
    const colorClassMap = {
      [this.env.services.localization.decimalPoint]:
        "o_colorlist_item_color_transparent_6",
      Backspace: "o_colorlist_item_color_transparent_1",
      "-": "o_colorlist_item_color_transparent_3",
      C: "o_colorlist_item_color_transparent_5",
    };

    return getButtons(DEFAULT_LAST_ROW, [
      { value: "quantity", text: _t("Qty") },
      {
        value: "discount",
        text: _t("%"),
        disabled: !this.pos.config.manual_discount,
      },
      {
        value: "price",
        text: _t("Price"),
        disabled: !this.pos.cashierHasPriceControlRights(),
      },
      BACKSPACE,
    ]).map((button) => ({
      ...button,
      class: `
            ${colorClassMap[button.value] || ""}
            ${this.pos.numpadMode === button.value ? "active" : ""}
            ${
              button.value === "quantity"
                ? "numpad-qty rounded-0 rounded-top mb-0"
                : ""
            }
            ${
              button.value === "price"
                ? "numpad-price rounded-0 rounded-bottom mt-0"
                : ""
            }
            ${
              button.value === "discount"
                ? "numpad-discount my-0 rounded-0 border-top border-bottom"
                : ""
            }
        `,
    }));
  },
});
