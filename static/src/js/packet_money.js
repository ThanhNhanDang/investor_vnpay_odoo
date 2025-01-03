/** @odoo-module **/
import {
  Component,
  onWillStart,
  markup,
  useEffect,
  useRef,
  useState,
} from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";
import { View } from "@web/views/view";
import { escape } from "@web/core/utils/strings";

export class PacketMoney extends Component {
  setup() {
    this.rpc = useService("rpc");
    this.popup = useService("popup");
    this.orm = useService("orm");
    this.company = useService("company");
    this.dialog = useService("dialog");
    this.moneyInput = useRef("moneyInput");
    // Sử dụng useEffect để focus vào input khi component được render
    useEffect(() => {
      if (this.moneyInput.el) {
        this.moneyInput.el.focus();
      }
    });
    this.vnpay = useService("vnpay");
    this.notification = useService("notification");
    this.state = useState({
      resId: null,
      kanbanViewId: null,
      formViewId: null,
      currencyId: null,
      searchViewId: null,
      isDisable: true,
      maxAmount: this.props.action.params?.max_packet_amount,
      maxAmountTemp: this.props.action.params?.max_packet_amount,
      companyId:
        this.props.action.params?.companyId == undefined
          ? 0
          : this.props.action.params.companyId,
      companyIds: [
        { id: 0, name: "Tất Cả" },
        ...Object.values(this.company.allowedCompanies),
      ],
      domain: [["isPacketMoney", "=", true]],
    });
    this.action = useService("action");
    this.user = useService("user");
    const translatedText = _t("No records found!");
    this.baseViewProps = {
      display: { searchPanel: false },
      editable: false,
      noBreadcrumbs: false,
      showButtons: true,
      createRecord: () =>
        this.selectRecord("product.template", false, {
          create: true,
          delete: true,
          default_isPacketMoney: true,
          default_currency_id: this.state.currencyId,
          default_list_price: 10000,
        }),
      noContentHelp: markup(`<p>${escape(translatedText)}</p>`),
      selectRecord: (resId) => this.selectRecord("product.template", resId),
    };
    onWillStart(async () => await this.initialize());
  }
  async handleKeyDown(ev) {
    if (ev.key === "Enter") {
      ev.preventDefault();
      if (!this.state.isDisable) {
        await this.saveMaxAmount();
      }
    }
  }
  handleInput(event) {
    // Lấy giá trị input và loại bỏ tất cả ký tự không phải số
    let value = event.target.value.replace(/[^\d]/g, "");
    // Chuyển về số để kiểm tra
    const numericValue = parseInt(value) || 0;
    if (numericValue < 0) {
      this.state.maxAmount = "0";
      this.state.isDisable = true;
      this.notification.add("Số tiền phải lớn hơn 0", { type: "danger" });
      return;
    }
    // Format số với dấu phân cách hàng nghìn
    const maxAmount = this.vnpay.formatAmount(numericValue);
    event.target.value = this.state.maxAmount = maxAmount;
    if (this.state.maxAmountTemp !== maxAmount) {
      this.state.isDisable = value === "";
    } else this.state.isDisable = true;
  }

  async initialize() {
    let baseDomain = [];

    if (this.props.action.params?.baseDomain != undefined)
      baseDomain = this.props.action.params.baseDomain;
    if (this.state.companyId != 0) {
      // this.state.domain.push([
      //   "connect_coffee_company_id",
      //   "=",
      //   this.state.companyId,
      // ]);
    }

    let data = await this.orm.searchRead(
      "ir.model.data",
      [["name", "=", "product_view_form_packet_money_kanban"]],
      ["res_id"],
      {
        limit: 1,
      }
    );

    this.state.kanbanViewId = data[0].res_id;
    data = await this.orm.searchRead(
      "ir.model.data",
      [["name", "=", "product_view_form_packet_money"]],
      ["res_id"],
      {
        limit: 1,
      }
    );
    this.state.formViewId = data[0].res_id;

    data = await this.rpc("/get/main_company", {});
    this.state.currencyId = data.currency_id;

    data = await this.orm.searchRead(
      "ir.model.data",
      [["name", "=", "product_template_search_form_view_stock"]],
      ["res_id"],
      {
        limit: 1,
      }
    );
    this.state.searchViewId = data[0].res_id;
  }

  selectRecord(res_model, resId, context = {}) {
    this.action.doAction(
      {
        type: "ir.actions.act_window",
        res_model: res_model,
        views: [[this.state.formViewId, "form"]],
        res_id: resId,
        context: context,
        target: "new",
      },
      {
        props: {
          onSave: (record, params) => {
            if (record.resId) {
              this.replaceCurrentAction({
                baseDomain: [],
                companyId: this.state.companyId,
              });
            }
          },
        },
      }
    );
  }
  async onChangeCompany() {
    if (this.state.companyId !== 0) {
      const companyData = await this.orm.searchRead(
        "res.company",
        [["id", "=", this.state.companyId]],
        ["max_packet_amount"],
        { limit: 1 }
      );
      if (companyData.length > 0) {
        this.state.maxAmount = this.vnpay.formatAmount(
          companyData[0].max_packet_amount || 0
        );
      }
    }
    this.replaceCurrentAction({
      companyId: parseInt(this.state.companyId),
      max_packet_amount: this.state.maxAmount,
    });
  }

  async saveMaxAmount() {
    try {
      if (this.state.companyId === 0) {
        return;
      }
      let data = await this.rpc("/company/save_max_amount", {
        company_id: this.state.companyId,
        max_packet_amount: this.vnpay.reverseFormatAmount(this.state.maxAmount),
      });
      if (data) {
        this.notification.add(_t("Lưu Thành Công"), {
          type: "success",
        });
        this.state.maxAmountTemp = this.state.maxAmount;
        this.state.isDisable = true;
      }
    } catch (error) {
      console.log(error);
      this.notification.add(_t("Lưu Thất Bại"), {
        type: "danger",
      });
    }
  }

  replaceCurrentAction(params) {
    const actionRequest = {
      id: this.props.action.id,
      type: "ir.actions.client",
      tag: "investor.packet_money",
      context: this.context,
      name: "Gói Nạp Tiền",
      params: params,
    };
    const options = { stackPosition: "replaceCurrentAction" };
    return this.action.doAction(actionRequest, options);
  }

  async initialize() {
    let baseDomain = [];
    if (this.props.action.params?.baseDomain != undefined)
      baseDomain = this.props.action.params.baseDomain;
    if (this.state.companyId != 0)
      this.state.domain.push([
        "connect_coffee_company_id",
        "=",
        this.state.companyId,
      ]);
    let data = await this.orm.searchRead(
      "ir.model.data",
      [["name", "=", "product_view_form_packet_money_kanban"]],
      ["res_id"],
      {
        limit: 1,
      }
    );

    this.state.kanbanViewId = data[0].res_id;
    data = await this.orm.searchRead(
      "ir.model.data",
      [["name", "=", "product_view_form_packet_money"]],
      ["res_id"],
      {
        limit: 1,
      }
    );
    this.state.formViewId = data[0].res_id;

    data = await this.rpc("/get/main_company", {});
    this.state.currencyId = data.currency_id;
    data = await this.orm.searchRead(
      "ir.model.data",
      [["name", "=", "product_template_search_form_view_stock"]],
      ["res_id"],
      {
        limit: 1,
      }
    );
    this.state.searchViewId = data[0].res_id;
  }

  get viewPropsTreeViewReport() {
    const props = {
      ...this.baseViewProps,
      context: { create: true },
      resModel: "product.template",
      type: "kanban",
      domain: this.state.domain,
      allowSelectors: false,
      viewId: this.state.kanbanViewId,
      forceGlobalClick: true,
      searchViewId: this.state.searchViewId,
    };
    return props;
  }
}

PacketMoney.template = "investor.packet_money";
PacketMoney.components = { View };
PacketMoney.props = {};
registry.category("actions").add("investor.packet_money", PacketMoney);
