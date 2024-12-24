/** @odoo-module */
import { _t } from "@web/core/l10n/translation";
import {
  Component,
  useState,
  useRef,
  useEffect,
  useExternalListener,
} from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
export class InputMoneyPopup extends Component {
  static template = "InputMoneyPopup";

  static defaultProps = {
    cancelText: _t("Cancel"),
    title: _t("InputMoneyPopup"),
    body: "",
    list: [],
    confirmKey: false,
  };

  /**
   * Value of the `item` key of the selected element in the Selection
   * Array is the payload of this popup.
   *
   * @param {Object} props
   * @param {String} [props.confirmText='Confirm']
   * @param {String} [props.cancelText='Cancel']
   * @param {String} [props.title='Select']
   * @param {String} [props.body='']
   * @param {Array<Selection>} [props.list=[]]
   *      Selection {
   *          id: integer,
   *          label: string,
   *          isSelected: boolean,
   *          item: any,
   *      }
   */
  setup() {
    super.setup(...arguments);
    this.notification = useService("notification");
    this.vnpay = useService("vnpay");
    this.state = useState({
      isDisable: true,
      formattedAmount: "",
    });
    this.moneyInput = useRef("moneyInput");
    // Sử dụng useEffect để focus vào input khi component được render
    useEffect(() => {
      if (this.moneyInput.el) {
        this.moneyInput.el.focus();
      }
    });
    useExternalListener(window, "keyup", this._onWindowKeyup);
  }

  _onWindowKeyup(event) {
    if (
      !this.props.isActive ||
      ["INPUT", "TEXTAREA"].includes(event.target.tagName)
    ) {
      return;
    }
    if (event.key === this.props.cancelKey) {
      this.cancel();
    } else if (event.key === this.props.confirmKey) {
      this.confirm();
    }
  }
  async confirm(input_money_popup = undefined) {
    this.props.close({ confirmed: true, payload: null });
    await this.vnpay.paynow(
      this.vnpay.reverseFormatAmount(input_money_popup) ||
      this.vnpay.reverseFormatAmount(this.state.formattedAmount)
    );
  }
  cancel() {
    this.props.close({ confirmed: false, payload: null });
  }
  handleKeyDown(ev) {
    if (ev.key === "Enter") {
      ev.preventDefault();
      if (!this.state.isDisable) {
        this.confirm();
      }
    }
  }

  handleInput(event) {
    // Lấy giá trị input và loại bỏ tất cả ký tự không phải số
    let value = event.target.value.replace(/[^\d]/g, "");
    // Chuyển về số để kiểm tra
    const numericValue = parseInt(value) || 0;
    if (numericValue < 0) {
      this.state.formattedAmount = "0";
      this.state.isDisable = true;
      this.notification.add("Số tiền phải lớn hơn 0", { type: "danger" });
      return;
    }
    this.state.isDisable = value === "";
    // Format số với dấu phân cách hàng nghìn
    event.target.value = this.state.formattedAmount =
      this.vnpay.formatAmount(numericValue);
  }
}
