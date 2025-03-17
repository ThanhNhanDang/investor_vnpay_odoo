/** @odoo-module */

import { patch } from "@web/core/utils/patch";
import { ClosePosPopup } from "@point_of_sale/app/navbar/closing_popup/closing_popup";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { ConnectionLostError } from "@web/core/network/rpc";
import { _t } from "@web/core/l10n/translation";
import { parseFloat } from "@web/views/fields/parsers";
import { deduceUrl } from "@point_of_sale/utils";
import { useService } from "@web/core/utils/hooks";
patch(ClosePosPopup.prototype, {
  setup() {
    super.setup(...arguments);
    this.orm = useService("orm");
    this.action = useService("action");
  },
  async checkInventory() {
    const data = await this.orm.call(
      "stock.quant",
      "action_view_inventory",
      [],
      {}
    );
    await this.action.doAction(
      { ...data, target: "new" },
      {
        onClose: (e) => {
          console.log(e)
        },
      }
    );
  },
  async closeSession() {
    const data = await this.orm.searchRead(
      "pos.session",
      [["id", "=", this.pos.session.id]],
      ["isCheckInventory"]
    );
    if (!data[0].isCheckInventory) {
      this.dialog.add(AlertDialog, {
        title: _t("Closing session error"),
        body: _t("Chưa tiến hành kiểm kê kho!!"),
      });
      return;
    }

    this.pos._resetConnectedCashier();
    if (this.pos.config.customer_display_type === "proxy") {
      const proxyIP = this.pos.getDisplayDeviceIP();
      fetch(`${deduceUrl(proxyIP)}/hw_proxy/customer_facing_display`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ params: { action: "close" } }),
      }).catch(() => {
        console.log("Failed to send data to customer display");
      });
    }
    // If there are orders in the db left unsynced, we try to sync.
    const syncSuccess = await this.pos.push_orders_with_closing_popup();
    if (!syncSuccess) {
      return;
    }
    if (this.pos.config.cash_control) {
      const response = await this.pos.data.call(
        "pos.session",
        "post_closing_cash_details",
        [this.pos.session.id],
        {
          counted_cash: parseFloat(
            this.state.payments[this.props.default_cash_details.id].counted
          ),
        }
      );

      if (!response.successful) {
        return this.handleClosingError(response);
      }
    }

    try {
      await this.pos.data.call(
        "pos.session",
        "update_closing_control_state_session",
        [this.pos.session.id, this.state.notes]
      );
    } catch (error) {
      // We have to handle the error manually otherwise the validation check stops the script.
      // In case of "rescue session", we want to display the next popup with "handleClosingError".
      // FIXME
      if (
        !error.data &&
        error.data.message !== "This session is already closed."
      ) {
        throw error;
      }
    }

    try {
      const bankPaymentMethodDiffPairs = this.props.non_cash_payment_methods
        .filter((pm) => pm.type == "bank")
        .map((pm) => [pm.id, this.getDifference(pm.id)]);
      const response = await this.pos.data.call(
        "pos.session",
        "close_session_from_ui",
        [this.pos.session.id, bankPaymentMethodDiffPairs],
        {
          context: {
            login_number: odoo.login_number,
          },
        }
      );
      if (!response.successful) {
        return this.handleClosingError(response);
      }
      localStorage.removeItem(`pos.session.${odoo.pos_config_id}`);
      location.reload();
    } catch (error) {
      if (error instanceof ConnectionLostError) {
        throw error;
      } else {
        await this.handleClosingControlError();
      }
    }
  },
});
