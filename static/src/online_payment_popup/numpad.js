import { Numpad } from "@point_of_sale/app/generic_components/numpad/numpad";
import { patch } from "@web/core/utils/patch";
import { useService } from "@web/core/utils/hooks";
patch(Numpad.prototype, {
  setup() {
    super.setup(...arguments);
    this.pos = useService("pos");
  },
  get currentOrder() {
    return this.pos.get_order();
}
});
