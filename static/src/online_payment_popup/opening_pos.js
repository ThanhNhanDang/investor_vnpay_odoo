/** @odoo-module */
import { patch } from "@web/core/utils/patch";
import { OpeningControlPopup } from "@point_of_sale/app/store/opening_control_popup/opening_control_popup";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";
import { parseFloat } from "@web/views/fields/parsers";
import { useService } from "@web/core/utils/hooks";
patch(OpeningControlPopup.prototype, {
  setup() {
    super.setup(...arguments);
    this.orm = useService("orm");
    this.action = useService("action");
  },
  async checkInventory() {
    const data = await this.orm.call(
      "stock.quant",
      "action_view_inventory_custom",
      [this.pos.session.id, false, true],
      {}
    );
    await this.action.doAction(
      { ...data, target: "new" },
      {
        onClose: (e) => {
          console.log(e);
        },
      }
    );
  },
  async checkDevice() {
    const data = await this.orm.call(
      "stock.quant",
      "action_view_inventory_custom",
      [this.pos.session.id, true, true],
      {}
    );
    await this.action.doAction(
      { ...data, target: "new" },
      {
        onClose: (e) => {
          console.log(e);
        },
      }
    );
  },

  async confirm() {
    const data = await this.orm.searchRead(
      "pos.session",
      [["id", "=", this.pos.session.id]],
      ["isCheckDeviceOpen", "isCheckInventoryOpen"]
    );
    if (!data[0].isCheckInventoryOpen) {
      this.dialog.add(AlertDialog, {
        title: _t("Lỗi mở phiên"),
        body: _t("Chưa tiến hành kiểm kê công cụ dụng cụ!!"),
      });
      return;
    }
    if (!data[0].isCheckDeviceOpen) {
      this.dialog.add(AlertDialog, {
        title: _t("Lỗi mở phiên"),
        body: _t("Chưa tiến hành kiểm kê thiết bị!!"),
      });
      return;
    }
    await this.pos.data.call(
      "pos.session",
      "set_opening_control",
      [
        this.pos.session.id,
        parseFloat(this.state.openingCash),
        this.state.notes,
      ],
      {},
      true
    );
    this.pos.session.state = "opened";
    this.props.close();
  },
});
