/** @odoo-module **/
import { NavBar } from "@web/webclient/navbar/navbar";
import { useService } from "@web/core/utils/hooks";
import { registry } from "@web/core/registry";
import { patch } from "@web/core/utils/patch";
import { UserMenu } from "@web/webclient/user_menu/user_menu";
import { onWillStart, useState, onMounted } from "@odoo/owl";
patch(NavBar.prototype, {
  setup() {
    super.setup();
    this.vnpay = useService("vnpay");
    this.orm = useService("orm");
    onWillStart(async () => {
      if (await this.user.hasGroup("investor.user_investor")) {
        this.vnpay.messageCallback(this.messageCallback.bind(this));
        let user_crypto_wallet = await this.orm.searchRead(
          "res.partner",
          [["user_ids", "in", [this.user.userId]]],
          ["crypto_wallet", "id"]
        );
        this.state.partner_id = user_crypto_wallet[0].id;
        this.state.crypto_wallet = this.vnpay.formatAmount(
          user_crypto_wallet[0].crypto_wallet
        );
      }
    });

    this.env.bus.addEventListener("update_crypto_wallet_nav", (event) =>
      this.trigger(event)
    );
  },

  trigger(event) {
    const { detail } = event;
    this.messageCallback(detail.crypto_wallet);
  },
  onRecharge() {
    this.vnpay.onRecharge(this.state.partner_id, this.state.crypto_wallet);
  },
  messageCallback(crypto_wallet) {
    this.state.crypto_wallet = crypto_wallet;
  },
});
