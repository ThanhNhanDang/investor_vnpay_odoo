/** @odoo-module **/
import { BurgerMenu } from "@web/webclient/burger_menu/burger_menu";
import { useService } from "@web/core/utils/hooks";
import { patch } from "@web/core/utils/patch";
import { onWillStart, useState } from "@odoo/owl";

patch(BurgerMenu.prototype, {
  setup() {
    super.setup();
    this.user = useService("user");
    this.state = useState({
      ...super.state,
      isUserInvestor: false,
    });

    onWillStart(async () => {
      this._closeBurger();
      let investor = await this.user.hasGroup("investor.user_investor");
      if (investor) this.state.isUserInvestor = true;
    });
  },
});
