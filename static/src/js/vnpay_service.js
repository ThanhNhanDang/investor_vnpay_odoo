/** @odoo-module **/

import { registry } from "@web/core/registry";
import { SelectCreateDialogEx } from "./select_create_dialog";
import { _t } from "@web/core/l10n/translation";

export const vnpayService = {
  dependencies: ["notification", "dialog", "orm", "rpc"],
  start(env, { notification, dialog, orm, rpc }) {
    let partner_id = 0;
    let messageCallback;
    let crypto_wallet = 0;
    async function openPaymentForm(productId) {
      dialog.add(SelectCreateDialogEx, {
        title: "CHỌN HÌNH THỨC THANH TOÁN",
        noCreate: true,
        multiSelect: false,
        resModel: "payment.provider",
        context: {},
        domain: [["state", "=", "enabled"]],
        onSelected: async ([resId]) => {
          await paynow(resId, productId);
        },
      });
    }

    async function createVnpayUrl(amount) {
      try {
        const paymentUrl = await orm.call(
          "payment.provider",
          "create_vnpay_payment_url",
          [],
          {
            amount: amount,
          }
        );

        if (!paymentUrl) {
          throw new Error("Không thể tạo URL thanh toán VNPAY");
        }

        return paymentUrl;
      } catch (error) {
        console.error("Lỗi khi tạo URL thanh toán VNPAY:", error);
        // Xử lý lỗi ở đây (ví dụ: hiển thị thông báo lỗi cho người dùng)
      }
    }

    async function paynow(payment_provider_id, product_id) {
      const product = await orm.read(
        "product.template",
        [product_id],
        ["list_price"]
      );
      // await this.addToCartInPage({ product_id: product_id, add_qty: 1 });
      const amount = product[0].list_price;

      // Tạo URL thanh toán VNPAY
      const vnpayUrl = await createVnpayUrl(amount);

      // Mở cửa sổ thanh toán VNPAY
      const width = 765;
      const height = 765;
      const left = (window.screen.width - width) / 2;
      const top = (window.screen.height - height) / 2;

      window.open(
        vnpayUrl,
        "VNPAY Payment",
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
      );

      window.onmessage = async function (e) {
        if (e.data.type === "PAYMENT") {
          try {
            const crypto_wallet = await savePayment(e.data, product_id);
            messageCallback(crypto_wallet);
          } catch (error) {
            console.log(error);
            notification.add(_t("Nạp tiền thất bại!!"), {
              type: "danger",
            });
          }
        }
      };
      return;
    }
    function formatAmount(Amount) {
      return Number(Amount).toLocaleString("en-US");
    }
    function reverseFormatAmount(formattedAmount) {
      // Loại bỏ tất cả dấu phẩy và khoảng trắng
      const cleanAmount = formattedAmount.replace(/[,\s]/g, "");
      // Chuyển đổi thành số
      const number = parseInt(cleanAmount);
      return number;
    }
    async function savePayment(data, product_id) {
      if (data.vnp_ResponseCode == "00") {
        await orm.write("res.partner", [partner_id], {
          crypto_wallet: data.vnp_Amount,
        });

        const amount = reverseFormatAmount(crypto_wallet) + data.vnp_Amount;
        crypto_wallet = formatAmount(amount);

        const data_response = await rpc("/payment/vnpay/create_invoice", {
          amount: data.vnp_Amount,
          partner_id: partner_id,
          product_id: product_id,
          payment_method: "pay",
          reference: data.order_id,
        });
        return crypto_wallet;
      }
    }

    async function onRecharge(partner_id_input, crypto_wallet_input) {
      partner_id = partner_id_input;
      crypto_wallet = crypto_wallet_input;
      let viewKanban = await orm.searchRead( 
        "ir.model.data",
        [["name", "=", "product_view_form_packet_money_kanban"]],
        ["res_id"]
      );
      const viewKanbanId = viewKanban[0].res_id;

      dialog.add(SelectCreateDialogEx, {
        title: "CHỌN GÓI NẠP TIỀN",
        noCreate: true,
        multiSelect: false,
        resModel: "product.template",
        context: {},
        isViewId: viewKanbanId,
        domain: [["isPacketMoney", "=", true]],
        onSelected: async ([resId]) => {
          await openPaymentForm(resId);
        },
      });
    }

    return {
      onRecharge: (partner_id_input, crypto_wallet_input) => {
        onRecharge(partner_id_input, crypto_wallet_input);
      },
      formatAmount: (Amount) => {
        return formatAmount(Amount);
      },
      messageCallback: (callback) => {
        messageCallback = callback;
      },
    };
  },
};

registry.category("services").add("vnpay", vnpayService);
