/** @odoo-module **/
import { BurgerMenu } from "@web/webclient/burger_menu/burger_menu";
import { useService } from "@web/core/utils/hooks";
import { patch } from "@web/core/utils/patch";
import { onWillStart, useState } from "@odoo/owl";

patch(BurgerMenu.prototype, {
  setup() {
    super.setup();
    this.user = useService("user");
    this.vnpay = useService("vnpay");
    this.orm = useService("orm");
    this.state = useState({
      ...super.state,
      isUserInvestor: false,
      crypto_wallet: 0,
      partner_id: 0,
    });

    onWillStart(async () => {
      this._closeBurger();
      let investor = await this.user.hasGroup("investor.user_investor");
      if (investor) {
        this.state.isUserInvestor = true;
        this.vnpay.messageCallback1(this.messageCallback1.bind(this));
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
  },
  onRecharge() {
    this.vnpay.onRecharge(this.state.partner_id, this.state.crypto_wallet);
    this._closeBurger();
  },
  messageCallback1(crypto_wallet) {
    this.state.crypto_wallet = crypto_wallet;
  },
});
