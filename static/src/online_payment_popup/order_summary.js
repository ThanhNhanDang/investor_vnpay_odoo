/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { OrderSummary } from "@point_of_sale/app/screens/product_screen/order_summary/order_summary";

import { useBarcodeReader } from "@point_of_sale/app/barcode/barcode_reader_hook";
import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
import { onMounted, useState } from "@odoo/owl";

patch(OrderSummary.prototype, {
  setup() {
    super.setup(...arguments);
    this.numberBuffer = useService("custom_number_buffer");
    this.numberBuffer.use({
      triggerAtInput: (...args) => this.updateSelectedOrderline(...args),
      useWithBarcode: true,
    });
    this.isSwitchPlus = false;
    this.isSwitchMinus = false;
  },

  async updateSelectedOrderline({ buffer, key }) {
    const order = this.pos.get_order();
    const selectedLine = order.get_selected_orderline();
    // Handling negation of value on first input
    if (buffer === "-0" && key == "-") {
      if (
        this.pos.numpadMode === "quantity" &&
        !selectedLine.refunded_orderline_id
      ) {
        buffer = selectedLine.get_quantity() * -1;
      } else if (this.pos.numpadMode === "discount") {
        buffer = selectedLine.get_discount() * -1;
      } else if (this.pos.numpadMode === "price") {
        buffer = selectedLine.get_unit_price() * -1;
      }
      this.numberBuffer.state.buffer = buffer.toString();
    }
    // This validation must not be affected by `disallowLineQuantityChange`
    if (
      selectedLine &&
      selectedLine.isTipLine() &&
      this.pos.numpadMode !== "price"
    ) {
      /**
       * You can actually type numbers from your keyboard, while a popup is shown, causing
       * the number buffer storage to be filled up with the data typed. So we force the
       * clean-up of that buffer whenever we detect this illegal action.
       */
      this.numberBuffer.reset();
      if (key === "Backspace") {
        this._setValue("remove");
      } else {
        this.dialog.add(AlertDialog, {
          title: _t("Cannot modify a tip"),
          body: _t("Customer tips, cannot be modified directly"),
        });
      }
      return;
    }
    if (
      selectedLine &&
      this.pos.numpadMode === "quantity" &&
      this.pos.disallowLineQuantityChange()
    ) {
      const orderlines = order.lines;
      const lastId =
        orderlines.length !== 0 && orderlines.at(orderlines.length - 1).uuid;
      const currentQuantity = this.pos
        .get_order()
        .get_selected_orderline()
        .get_quantity();

      if (selectedLine.noDecrease) {
        this.dialog.add(AlertDialog, {
          title: _t("Invalid action"),
          body: _t("You are not allowed to change this quantity"),
        });
        return;
      }
      const parsedInput = (buffer && parseFloat(buffer)) || 0;
      if (lastId != selectedLine.uuid) {
        this._showDecreaseQuantityPopup();
      } else if (currentQuantity < parsedInput) {
        this._setValue(buffer);
      } else if (parsedInput < currentQuantity) {
        this._showDecreaseQuantityPopup();
      }
      return;
    } else if (
      selectedLine &&
      this.pos.numpadMode === "discount" &&
      this.pos.restrictLineDiscountChange()
    ) {
      this.numberBuffer.reset();
      const inputNumber = await makeAwaitable(this.dialog, NumberPopup, {
        startingValue: selectedLine.get_discount() || 10,
        title: _t("Set the new discount"),
      });
      if (inputNumber) {
        await this.pos.setDiscountFromUI(selectedLine, inputNumber);
      }
      return;
    } else if (
      selectedLine &&
      this.pos.numpadMode === "price" &&
      this.pos.restrictLinePriceChange()
    ) {
      this.numberBuffer.reset();
      const inputNumber = await makeAwaitable(this.dialog, NumberPopup, {
        startingValue: selectedLine.get_unit_price(),
        title: _t("Set the new price"),
      });
      if (inputNumber) {
        await this.setLinePrice(selectedLine, inputNumber);
      }
      return;
    }
    let val = buffer === null ? "remove" : buffer;
    if (key === "C") {
      val = "remove";
    } else if (key === " + ") {
      if (this.isSwitchPlus === true) {
        const value = this._getValue();
        val = value + 1;
        this.numberBuffer.set(val.toString());
      } else {
        this.isSwitchPlus = true;
        this.isSwitchMinus = false;
        return;
      }
    } else if (key === " - ") {
      if (this.isSwitchMinus === true) {
        const value = this._getValue();
        val = value <= 0 ? "remove" : value - 1;
        val !== "remove" ?? this.numberBuffer.set(val.toString());
      } else {
        this.isSwitchPlus = false;
        this.isSwitchMinus = true;
        return;
      }
    } else {
      if (this.pos.numpadMode !== " + " && this.pos.numpadMode !== " - ") {
        this.isSwitchPlus = false;
        this.isSwitchMinus = false;
      } else {
        if (this.pos.numpadMode === " + ") {
          if (this.isInteger(key)) {
            const value = this._getValue();
            val = value + parseInt(key);
            this.numberBuffer.set(val.toString());
          }
        } else if (this.pos.numpadMode === " - ") {
          if (this.isInteger(key)) {
            const value = this._getValue();
            val = value - parseInt(key);
            if (val < 0) val = 0;
            this.numberBuffer.set(val.toString());
          }
        }
      }
    }

    this._setValue(val);
    if (val == "remove") {
      this.numberBuffer.reset();
      this.pos.numpadMode = "quantity";
    }
  },
  isInteger(value) {
    // Chuyển giá trị sang số
    let num = Number(value);

    // Kiểm tra có phải số nguyên không
    return Number.isInteger(num);
  },

  _setValue(val) {
    const { numpadMode } = this.pos;
    let selectedLine = this.currentOrder.get_selected_orderline();
    if (selectedLine) {
      if (
        numpadMode === "quantity" ||
        numpadMode === " + " ||
        numpadMode === " - "
      ) {
        if (selectedLine.combo_parent_id) {
          selectedLine = selectedLine.combo_parent_id;
        }
        if (val === "remove") {
          this.currentOrder.removeOrderline(selectedLine);
        } else {
          const result = selectedLine.set_quantity(
            val,
            Boolean(selectedLine.combo_line_ids?.length)
          );
          for (const line of selectedLine.combo_line_ids) {
            line.set_quantity(val, true);
          }
          if (result !== true) {
            this.dialog.add(AlertDialog, result);
            this.numberBuffer.reset();
          }
        }
      } else if (numpadMode === "discount" && val !== "remove") {
        this.pos.setDiscountFromUI(selectedLine, val);
      } else if (numpadMode === "price" && val !== "remove") {
        this.setLinePrice(selectedLine, val);
      }
    }
  },

  _getValue() {
    const selectedLine = this.currentOrder.get_selected_orderline();
    if (selectedLine === undefined) return -1;
    const quantity = selectedLine.get_quantity();
    if (selectedLine.is_reward_line && quantity != 0) return "";
    return selectedLine.get_quantity();
  },
});
